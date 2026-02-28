# gRPC 压测功能

## 功能概述

gRPC 压测功能允许用户对选定的 Unary RPC 方法进行负载测试，评估服务端的 QPS、延迟分布和错误率等性能指标。主要能力包括：

- **双模式压测**：按总请求数（count）或按持续时间（duration）执行
- **可配置并发**：支持 1～10000 的并发数
- **阶梯加压**：可选从低并发逐步增加到目标并发，观察服务在不同负载下的表现
- **请求体变量**：支持在 JSON 请求体中插入序列、随机整数、随机字符串、列表随机等变量，实现参数化压测
- **实时监控**：压测过程中每 500ms 上报一次 QPS、延迟、成功率等指标
- **结果导出**：支持 JSON 和 CSV 格式导出压测结果

## 架构设计

压测功能采用三层架构，数据流向如下：

```
┌─────────────────────────────────────────────────────────────────────────┐
│  前端 (React)                                                             │
│  BenchmarkPanel / BenchmarkChart / VariableConfig                         │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    │ Wails IPC (StartBenchmark / StopBenchmark / ExportBenchmarkResult)
                                    │ EventsOn (benchmark:progress / benchmark:done / benchmark:error)
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  IPC 层 (app.go)                                                          │
│  App.StartBenchmark / App.StopBenchmark / App.ExportBenchmarkResult       │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    │ 调用 Caller.RunBenchmark
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  压测引擎 (internal/grpc/benchmark.go)                                    │
│  连接池、Worker 协程、变量替换、延迟收集、阶梯加压                         │
└─────────────────────────────────────────────────────────────────────────┘
```

- **后端引擎**：负责创建连接池、启动 Worker、执行 RPC 调用、收集延迟、计算分位数
- **IPC 层**：将 Go 方法暴露给前端，通过 Wails 事件向前端推送进度和结果
- **前端面板**：配置压测参数、展示实时图表、导出结果

## 后端实现

### 数据模型

压测相关的 Go 结构体定义于 `internal/models/types.go`：

| 结构体 | 字段 | 含义 |
|--------|------|------|
| **BenchmarkConfig** | `Mode` | 压测模式：`"count"` 按请求数，`"duration"` 按持续时间 |
| | `Concurrency` | 并发数 |
| | `TotalRequests` | 总请求数（mode=count 时有效） |
| | `DurationSec` | 持续时间秒数（mode=duration 时有效） |
| | `RampUpEnabled` | 是否启用阶梯加压 |
| | `RampUpStepSec` | 阶梯间隔秒数 |
| | `RampUpStepAdd` | 每步增加的并发数 |
| | `Variables` | 变量配置列表 |
| **BenchmarkVariable** | `Name` | 变量名，在 Body 中用 `{{name}}` 引用 |
| | `Type` | 类型：`sequence` / `random_int` / `random_string` / `list` |
| | `Min` | 最小值（sequence/random_int）或起始值 |
| | `Max` | 最大值（random_int）或字符串长度（random_string） |
| | `Values` | 候选值列表（type=list 时） |
| **BenchmarkProgress** | `ElapsedMs` | 已运行毫秒数 |
| | `TotalSent` | 已发送请求数 |
| | `TotalSuccess` | 成功数 |
| | `TotalError` | 失败数 |
| | `CurrentQPS` | 当前 QPS |
| | `AvgLatencyMs` | 平均延迟（ms） |
| | `P50Ms` / `P90Ms` / `P99Ms` | 延迟分位数 |
| | `MinLatencyMs` / `MaxLatencyMs` | 最小/最大延迟 |
| | `ErrorCodes` | 错误码及其出现次数 |
| **BenchmarkResult** | 继承 BenchmarkProgress | 最终汇总指标 |
| | `Concurrency` | 实际并发数 |
| | `DurationMs` | 总耗时（ms） |
| | `LatencyBuckets` | 延迟分桶直方图 |
| **LatencyBucket** | `LabelMs` | 区间标签，如 `"≤10ms"`、`"10-20ms"` |
| | `Count` | 落在该区间的请求数 |

### 压测引擎 (benchmark.go)

核心逻辑在 `Caller.RunBenchmark` 中实现，主要设计如下：

1. **连接池**：`createConnPool` 根据并发数创建多个 gRPC 连接，Worker 轮询使用，避免单连接瓶颈。

2. **Worker 模型**：每个 Worker 在独立 goroutine 中运行，通过 `limiter()` 判断是否继续发送请求：
   - `mode=count`：`dispatched.Add(1) <= total` 控制总请求数
   - `mode=duration`：`time.After(duration)` 到期后停止

3. **变量替换**：`resolveVariables` 在每次请求前将 Body 中的 `{{varName}}` 替换为实际值：
   - `sequence`：递增序列，`seq.Add(1)+min-1`
   - `random_int`：`[min, max]` 随机整数
   - `random_string`：指定长度的小写字母+数字随机串
   - `list`：从 `values` 中随机选取

4. **延迟收集**：使用 `sync.Mutex` 保护的 `latencies` 切片记录每次 RPC 的耗时，实时计算 P50/P90/P99 等分位数。

5. **实时上报**：`progressTicker` 每 500ms 触发一次，调用 `buildProgress` 生成 `BenchmarkProgress`，通过 `onProgress` 回调（即 `runtime.EventsEmit("benchmark:progress", p)`）推送给前端。

6. **阶梯加压**：若 `RampUpEnabled` 为 true，初始仅启动 `RampUpStepAdd` 个 Worker，每隔 `RampUpStepSec` 秒增加 `RampUpStepAdd` 个，直到达到 `Concurrency`。

7. **停止控制**：通过 `context.WithCancel` 实现，用户调用 `StopBenchmark` 时执行 `cancel()`，所有 Worker 和进度上报 goroutine 检测到 `ctx.Err() != nil` 后退出。

8. **延迟分桶**：`buildLatencyBuckets` 使用预定义边界 `[1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000]` ms 对延迟进行分桶，用于绘制直方图。

### IPC 层 (app.go)

三个 Wails 绑定方法及事件通信：

| 方法 | 作用 |
|------|------|
| `StartBenchmark(req, cfg)` | 启动压测，在 goroutine 中调用 `Caller.RunBenchmark`，通过 `benchmarkCancel` 支持取消 |
| `StopBenchmark()` | 调用 `benchmarkCancel()` 取消正在运行的压测 |
| `ExportBenchmarkResult(result, format)` | 弹出保存对话框，按 `format`（`"json"` 或 `"csv"`）导出结果到文件 |

**事件**：

- `benchmark:progress`：每 500ms 推送一次 `BenchmarkProgress`
- `benchmark:done`：压测结束时推送 `BenchmarkResult`
- `benchmark:error`：发生错误时推送错误信息字符串

## 前端实现

### 类型声明

`frontend/src/types/wails.d.ts` 中的 TypeScript 接口与后端模型一一对应：

```typescript
interface BenchmarkVariable {
  name: string;
  type: 'sequence' | 'random_int' | 'random_string' | 'list';
  min: number;
  max: number;
  values: string[];
}

interface BenchmarkConfig {
  mode: 'count' | 'duration';
  concurrency: number;
  totalRequests: number;
  durationSec: number;
  rampUpEnabled: boolean;
  rampUpStepSec: number;
  rampUpStepAdd: number;
  variables: BenchmarkVariable[];
}

interface BenchmarkProgress {
  elapsedMs: number;
  totalSent: number;
  totalSuccess: number;
  totalError: number;
  currentQps: number;
  avgLatencyMs: number;
  p50Ms: number;
  p90Ms: number;
  p99Ms: number;
  minLatencyMs: number;
  maxLatencyMs: number;
  errorCodes: Record<string, number>;
}

interface LatencyBucket {
  labelMs: string;
  count: number;
}

interface BenchmarkResult extends BenchmarkProgress {
  concurrency: number;
  durationMs: number;
  latencyBuckets: LatencyBucket[];
}
```

### BenchmarkPanel

主面板组件管理三种状态：`idle`、`running`、`done`。

- **idle**：展示配置表单（模式、并发、总请求数/持续时间、阶梯加压、变量配置），提供「开始压测」按钮；监听 `rpccall:start-benchmark` 自定义事件以支持命令面板触发。
- **running**：展示 `MetricCards`（QPS、平均延迟、P50/P90/P99、成功率、已发送/成功/失败）、`BenchmarkChart` 实时折线图、「停止压测」按钮；监听 `benchmark:progress` 累积 `progressHistory`，监听 `rpccall:stop-benchmark`。
- **done**：展示汇总指标、延迟分布（Min/P50/P90/P99/Max）、延迟直方图、QPS/延迟趋势图、错误码分布；提供「导出 JSON」「导出 CSV」「重新配置」按钮。

### BenchmarkChart

SVG 双 Y 轴折线图实现：

- **左 Y 轴**：QPS，绿色 `#22c55e`
- **右 Y 轴**：平均延迟（ms），橙色 `#f59e0b`
- **X 轴**：已运行时间（秒）
- **数据**：从 `history` 中取 `elapsedMs`、`currentQps`、`avgLatencyMs`，分别缩放后绘制两条折线
- **图例**：左上角标注 QPS 与平均延迟

`MetricCards` 子组件以卡片形式展示 QPS、平均延迟、P50/P90/P99、成功率、已发送/成功/失败等指标。

### VariableConfig

变量配置组件：

- 支持添加、删除变量
- 每个变量可配置：名称、类型（递增序列 / 随机整数 / 随机字符串 / 列表随机）
- 根据类型显示不同输入：`sequence`/`random_int` 显示 Min/Max；`random_string` 显示长度；`list` 显示逗号分隔的候选值
- 提示用户在 Body 中用 `{{varName}}` 引用变量

### 集成

- **RequestEditor**：在请求编辑区域增加「Benchmark」标签页，与 Request Body、Metadata、TLS 并列；切换到该标签时渲染 `BenchmarkPanel`。
- **CommandPalette**：在命令面板中增加 BENCHMARK 分类，包含「Start Benchmark」和「Stop Benchmark」命令，通过 `document.dispatchEvent(new CustomEvent("rpccall:start-benchmark"))` 和 `rpccall:stop-benchmark` 与 `BenchmarkPanel` 通信；`BenchmarkPanel` 根据当前状态决定是否响应（idle 时响应 start，running 时响应 stop）。

## 使用指南

1. **选择方法**：在左侧服务树中选中要压测的 Unary 方法。
2. **编辑请求体**：在 Request Body 中编写 JSON，可使用 `{{变量名}}` 占位符。
3. **配置变量**：切换到 Benchmark 标签，在「变量配置」中添加变量，设置类型和参数。
4. **设置压测参数**：选择模式（按请求数/按持续时间）、并发数、总请求数或持续时间；可选启用阶梯加压。
5. **开始压测**：点击「开始压测」，或通过命令面板（⌘K）选择「Start Benchmark」。
6. **查看结果**：压测过程中可查看实时 QPS 和延迟曲线；结束后可查看汇总、延迟分布、错误码，并导出 JSON 或 CSV。

## 导出格式

### JSON

完整 `BenchmarkResult` 的 JSON 序列化，包含所有指标、错误码、延迟分桶等，便于程序化分析。

### CSV

按「指标-值」对组织的表格格式：

- 第一列：Metric（如 Total Sent、QPS、Avg Latency (ms) 等）
- 第二列：Value
- 空行分隔后为 Error Code 与 Count 表
- 再空行分隔后为 Latency Bucket 与 Count 表

示例结构：

```csv
Metric,Value
Total Sent,1000
Total Success,998
Total Error,2
Duration (ms),5234
QPS,191.05
Avg Latency (ms),12.34
P50 (ms),10.00
P90 (ms),25.00
P99 (ms),80.00
Min Latency (ms),2.00
Max Latency (ms),120.00
Concurrency,10

Error Code,Count
UNKNOWN,1
DEADLINE_EXCEEDED,1

Latency Bucket,Count
≤10ms,450
10-20ms,380
20-50ms,150
...
```
