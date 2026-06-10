<div align="center">

<img src="build/appicon.png" width="120" alt="RpcCall" />

# RpcCall

**一款跨平台桌面端 gRPC 调试工具 —— gRPC 界的 Postman / BloomRPC**

支持 Proto 导入与服务反射、四种 RPC 调用模式、TLS/mTLS、压测、Mock 服务、Payload 解码、链式调用、环境变量、AI 辅助等。

基于 [Wails v2](https://wails.io)（Go 后端 + React/TypeScript 前端）构建，单文件原生应用，体积小、启动快。

</div>

---

## 界面截图

<div align="center">

![主界面 - gRPC 一元调用](docs/images/overview.png)

</div>

<table>
<tr>
<td width="50%"><img src="docs/images/benchmark.png" alt="压力测试" /><p align="center"><b>压力测试</b></p></td>
<td width="50%"><img src="docs/images/decode.png" alt="Payload 解码" /><p align="center"><b>Payload 解码</b></p></td>
</tr>
<tr>
<td width="50%"><img src="docs/images/chain.png" alt="链式调用" /><p align="center"><b>链式调用</b></p></td>
<td width="50%"><img src="docs/images/mock.png" alt="Mock 服务器" /><p align="center"><b>Mock 服务器</b></p></td>
</tr>
<tr>
<td colspan="2"><img src="docs/images/command-palette.png" alt="命令面板" /><p align="center"><b>命令面板（⌘K）</b></p></td>
</tr>
</table>

---

## 功能特性

### 核心调用
- **四种 gRPC 调用模式**：一元（Unary）、服务端流（Server Stream）、客户端流（Client Stream）、双向流（Bidi Stream）。流式调用实时推送每条消息。
- **Proto 导入与反射**：支持导入单个 `.proto` 文件、整个目录，或通过 gRPC Server Reflection 自动发现服务。多级 import 解析，内置 `google/protobuf` 描述符。
- **请求模板自动生成**：选中方法后自动生成默认 JSON 请求体。
- **请求超时配置**：发送按钮旁可设置超时（默认 30s，范围 1–3600s）。

### 请求与响应
- **JSON 语法高亮编辑器**：请求体实时高亮，一键 **格式化 / 压缩**，`Tab` 插入两空格缩进。
- **元数据（Metadata）**：键值对编辑或 JSON 批量导入，支持环境变量引用。
- **响应查看**：树形 / 原始两种视图，响应头 / 尾部元数据分区展示，调用计时分解（建连 / 序列化 / RPC / 总计）。
- **文本搜索**：`⌘F` 在请求体 / 响应体内搜索并高亮。

### 工程化能力
- **环境变量**：创建多套环境（dev / staging / prod），请求体、地址栏、Metadata 中用 `{{varName}}` 引用，发送前自动替换。
- **收藏集合（Collections）**：把完整请求配置（地址 + 方法 + Body + Metadata + TLS）按集合分组保存，一键加载到新标签页。
- **多项目隔离**：Proto 来源、解码模板按项目隔离管理。
- **历史记录 + Diff 对比**：自动记录每次请求，可回放到新标签页；`⌘`+点击选两条进行逐行 Diff 对比。
- **工作台导入 / 导出**：整体备份与迁移配置。
- **多标签页**：并行管理多个调用上下文。

### 高级工具
- **压力测试（Benchmark）**：按请求数 / 持续时间 / 目标 QPS 三种模式，支持并发阶梯加压与变量注入；实时 QPS / 延迟趋势、延迟分布（P50/P90/P99）、错误码分布图表；结果可导出 JSON / CSV / HTML。
- **链式调用（Chain）**：按顺序编排多个请求，用 `{{prev.field}}` 引用上一步响应字段实现接口编排，模板可保存复用。
- **Mock 服务器**：本地启动 gRPC Mock Server，配置状态码、延迟与自定义响应体，方便前端联调。
- **Payload 解码**：将 hex / base64 / 转义 / 原始二进制内容解析为可读 JSON，支持批量解码、结果对比、嵌套字段二次解码、解码模板与历史回放。
- **AI 辅助**：配置 OpenAI 兼容接口后，可「AI 生成」请求体、「AI 分析」响应、「AI 诊断」错误。

### 连接与安全
- **TLS / mTLS**：无 TLS / 仅 CA 校验 / 双向证书（CA + 客户端证书 + 密钥）三种模式。

### 体验
- **命令面板（`⌘K`）**：模糊搜索方法、执行命令，键盘全程操作。
- **主题与语言**：深色 / 浅色主题，中文 / 英文切换。
- **快捷键体系**：常用操作均有快捷键（见下表）。

---

## 快速开始

### 环境要求
- [Go](https://go.dev/) ≥ 1.24
- [Node.js](https://nodejs.org/) ≥ 18 + npm
- [Wails CLI v2](https://wails.io/docs/gettingstarted/installation)

```bash
go install github.com/wailsapp/wails/v2/cmd/wails@v2.11.0
# 确保 $(go env GOPATH)/bin 在 PATH 中
wails doctor   # 检查环境
```

### 开发模式（热重载）

```bash
wails dev
```

自动安装前端依赖并启动 Vite，Go 与前端均热重载；也可在浏览器访问 `http://localhost:34115` 调试。

### 生产构建

```bash
wails build      # 产物输出到 build/bin/RpcCall.app（macOS）
```

### 运行测试

```bash
go test ./...
go test ./internal/grpc -v
```

---

## 快捷键

| 快捷键 | 功能 |
|--------|------|
| `⌘K` | 打开 / 关闭命令面板 |
| `⌘T` | 新建标签页 |
| `⌘W` | 关闭当前标签页 |
| `⌘Enter` | 发送请求 |
| `⌘R` | 重新加载所有 Proto |
| `⌘F` | 搜索文本（请求体 / 响应体） |
| `Tab` | 编辑器内插入两空格缩进 |
| `Esc` | 关闭搜索 / 弹窗 |

---

## 技术栈

| 层 | 技术 |
|----|------|
| 桌面框架 | Wails v2.11 |
| 后端 | Go 1.24 · `jhump/protoreflect` · `google.golang.org/grpc` |
| 存储 | SQLite（`modernc.org/sqlite`，纯 Go 无 CGO） |
| 前端 | React 18 · TypeScript 5 · Vite 5 · Zustand · Radix UI |
| 样式 | Tailwind CSS v4 · CSS 变量主题 |

数据库位置：`~/Library/Application Support/RpcCall/history.db`

---

## 项目结构

```
rpcCall/
├── main.go                 # 应用入口，Wails 配置 + 前端 embed
├── app.go                  # IPC 桥接层，对前端暴露后端方法
├── internal/
│   ├── grpc/               # gRPC 调用引擎、proto 解析、反射、解码、压测、Mock、连接
│   ├── history/            # SQLite 持久化
│   ├── models/             # 共享数据模型
│   ├── ai/                 # AI 客户端
│   └── logger/             # 文件日志
├── frontend/               # React + TS 前端（components / store / i18n）
└── docs/                   # 架构、功能与开发文档
```

更详细的架构说明见 [`docs/project-architecture.md`](docs/project-architecture.md)。
