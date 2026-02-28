# Phase 3: gRPC 动态调用引擎 - 已完成

## 完成的功能点

1. **Unary 调用** (`caller.InvokeUnary`)
   - JSON -> `dynamic.Message` 序列化
   - 通过 `grpcdynamic.Stub.InvokeRpc` 发送请求
   - 收集 response headers / trailers / status code / elapsed time
   - 响应解码为 JSON 并返回

2. **Server Streaming** (`caller.InvokeServerStream`)
   - 异步 goroutine 接收流式响应
   - 每条消息通过回调通知前端 (Wails Events: `stream:message`)
   - 流结束通过回调通知 (Wails Events: `stream:done`)
   - 多条消息用 `---` 分隔展示

3. **Client Streaming** (`caller.InvokeClientStream`)
   - 支持单个 JSON 对象或 JSON 数组作为输入
   - JSON 数组时逐条发送，然后 CloseAndReceive

4. **Bidirectional Streaming** (`caller.InvokeBidiStream`)
   - 同 Client Streaming 的输入方式
   - CloseSend 后异步接收所有响应
   - 通过 Wails Events 实时推送

5. **Metadata 支持**
   - 请求 metadata 通过 `grpc.WithOutgoingContext` 附加
   - 响应 headers 和 trailers 完整收集并返回给前端
   - 前端 MetadataTable 组件支持添加/删除/启用/禁用

6. **前端 Send 按钮集成**
   - `useGrpc` hook 封装所有调用逻辑
   - 根据方法类型自动选择调用方式
   - Loading 状态管理
   - 流式响应实时更新 UI
   - 回车键快捷发送

## 关键文件

| 文件 | 变更 |
|------|------|
| `internal/grpc/caller.go` | 完整实现四种 gRPC 调用模式 |
| `app.go` | 新增 InvokeClientStream/InvokeServerStream/InvokeBidiStream |
| `frontend/src/hooks/useGrpc.ts` | 新建，封装 gRPC 调用 + 流式事件监听 |
| `frontend/src/types/wails.d.ts` | 新建，全局类型声明 |
| `frontend/src/components/connection/AddressBar.tsx` | 集成 useGrpc, 连接 Send 按钮 |

## 当前项目状态

- `wails build` 成功 (6 秒)
- 支持完整的 Unary / Server Stream / Client Stream / Bidi Stream 调用
- Metadata 请求头收发完整
- 流式响应实时推送到前端

## 下一步 (Phase 4)

- 实现 TLS/mTLS 连接支持
- 证书文件选择 UI
- 连接管理器
