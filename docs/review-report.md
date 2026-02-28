# RpcCall 代码审查报告

本文档记录对 RpcCall 项目的代码审查结论、已采纳的最佳实践、已修复问题与后续建议。

---

## 1. 架构与分层

| 层级 | 说明 | 评价 |
|------|------|------|
| **Go 后端** | `app.go` 为入口，`internal/grpc`（caller/connection/reflection/proto_parser）、`internal/history`、`internal/logger`、`internal/models` 职责清晰 | ✅ 分层合理，符合工业项目结构 |
| **前端** | React + Zustand + 按功能划分的 components/hooks/store | ✅ 状态集中、组件可维护 |
| **IPC** | Wails 绑定 + 自定义事件（rpccall:*） | ✅ 前后端边界清晰 |

---

## 2. 安全性

| 项 | 说明 | 状态 |
|----|------|------|
| **SQL 注入** | 所有 DB 操作均使用参数化查询（`?` 占位符），无拼接 SQL | ✅ 安全 |
| **路径与输入** | 文件路径来自系统对话框或 UserConfigDir；address/name 在 Store 层做非空校验 | ✅ 已校验 |
| **TLS** | 使用标准 `crypto/tls`、`x509`，证书通过文件路径加载，未硬编码密钥 | ✅ 无敏感信息泄露风险 |
| **前端** | 未向 UI 暴露密钥；仅通过 Wails 调用后端 | ✅ 合理 |

**建议**：若将来支持“跳过服务端证书验证”，应仅限开发环境并可配置关闭。

---

## 3. 错误处理与健壮性

| 位置 | 原问题 | 修复/现状 |
|------|--------|-----------|
| **app.go** | `history.NewStore()` 错误被忽略，导致静默无历史功能 | ✅ 已改为记录日志并将 `historyStore = nil`，其它功能照常 |
| **history/store.go** | `Save()` 中 `json.Marshal` 错误被忽略 | ✅ 失败时回退为 `[]`，避免写入异常 JSON |
| **history/store.go** | `UpdateAddress` 未校验空 address | ✅ 已校验 `address != ""`，空 name 时用 address 填充 |
| **caller.go** | 流式调用中 `conn` 在 goroutine 内 `defer conn.Close()` | ✅ 无泄漏 |
| **前端** | 渲染异常导致白屏 | ✅ 已有 ErrorBoundary，可降级展示并重载 |

**建议**：`reflection.go` 中 ListServices 对单个服务解析失败时 `continue` 合理，若需可增加可选日志便于排查。

---

## 4. 编码规范与可维护性

| 项 | 说明 |
|----|------|
| **Go** | 包名、导出/未导出命名一致；错误用 `fmt.Errorf("%w")` 包装；无裸 `return` 依赖命名返回值 |
| **TypeScript** | 使用 `wails.d.ts` 声明后端接口；GrpcRequest/GrpcResponse 与后端模型一致 |
| **React** | 事件监听通过 ref 持有最新 handler，effect 依赖 `[clearProtoFiles]`，避免每轮渲染重复注册且逻辑始终最新 |

---

## 5. 性能与资源

| 项 | 说明 |
|----|------|
| **SQLite** | 单文件、无长事务堆积；`defer rows.Close()` 使用正确 |
| **gRPC** | Unary/ClientStream 使用 `context.WithTimeout(30s)`；流式在 goroutine 内正确 `defer conn.Close()` |
| **前端** | `useMemo` 用于 groups 等派生数据；命令面板的 allMethods/filteredMethods 已做 useMemo |

---

## 6. 已修复问题汇总

1. **app.go**：处理 `history.NewStore()` 失败，打日志并降级为无历史功能。
2. **history/store.go**：`Save()` 中 JSON 序列化失败时使用安全默认值；`UpdateAddress` 增加 address/name 校验。
3. **ServiceTree.tsx**：命令面板相关事件监听改为通过 `handlersRef` 调用最新 handler，effect 依赖 `[clearProtoFiles]`，避免每帧重复注册。

---

## 7. 后续可选改进

| 优先级 | 建议 | 说明 |
|--------|------|------|
| 低 | 使用 `grpc.NewClient` 替代已弃用 `grpc.Dial` | 需 grpc-go >= 1.63，迁移时注意 WithBlock/超时用 Context 控制 |
| 低 | `GetLogPath()` 基于可执行路径回退到项目目录 | 打包后路径假设可能失效，可改为 UserConfigDir 或配置项 |
| 中 | 历史记录分页或上限 | 当前 `List(limit)` 默认 100，可加 UI 分页或可配置上限 |
| 中 | 请求超时可配置 | 当前 30s 写死，可从前端传入或从配置读取 |

---

## 8. 结论

- **安全性**：SQL 参数化、无硬编码密钥、TLS 使用规范，满足当前桌面客户端需求。
- **健壮性**：历史存储失败可降级、输入校验完善、前端有 ErrorBoundary，行为可预期。
- **可维护性**：结构清晰、错误可追溯、事件监听方式正确，便于后续扩展与排错。

整体符合工业级桌面应用的编码规范与安全实践，上述小修复已落地，可选改进可按优先级逐步迭代。
