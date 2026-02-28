# gRPC 四种调用方式详解

## 概述

gRPC 基于 HTTP/2 协议，支持四种调用模式。每种模式适用于不同的业务场景。

```
┌────────────────────────────────────────────────────────┐
│             gRPC 调用模式对比                            │
├──────────────┬──────────┬──────────┬───────────────────┤
│ 类型         │ 客户端   │ 服务端   │ 典型场景          │
├──────────────┼──────────┼──────────┼───────────────────┤
│ Unary        │ 1 条消息 │ 1 条消息 │ 常规请求/响应     │
│ Server Stream│ 1 条消息 │ N 条消息 │ 数据推送/列表拉取 │
│ Client Stream│ N 条消息 │ 1 条消息 │ 文件上传/批量提交 │
│ Bidi Stream  │ N 条消息 │ N 条消息 │ 实时聊天/双向同步 │
└──────────────┴──────────┴──────────┴───────────────────┘
```

---

## 1. Unary RPC（一元调用）

### 原理

最基础的调用方式，等同于传统的 HTTP 请求-响应模型。客户端发送一条请求消息，服务端返回一条响应消息。

```
Client                    Server
  │                         │
  │ ── Request Message ──>  │
  │                         │ (处理请求)
  │ <── Response Message ── │
  │                         │
```

### Proto 定义

```protobuf
service UserService {
  rpc GetUser(GetUserRequest) returns (GetUserResponse);
}
```

### 在 RpcCall 中的实现

**后端** (`caller.go` - `InvokeUnary`)：
1. 查找方法描述符（从 proto 解析结果或反射中获取）
2. 建立 gRPC 连接（支持 TLS/mTLS）
3. 将 JSON 请求体反序列化为 Protobuf 动态消息
4. 设置 metadata（请求头）
5. 调用 `stub.InvokeRpc()` 发送请求并等待响应
6. 将响应 Protobuf 消息序列化为 JSON 返回

**前端** (`useGrpc.ts`)：
- 直接 `await window.go.main.App.InvokeUnary(request)` 获取响应

### 请求体格式

```json
{
  "userId": "12345",
  "includeProfile": true
}
```

---

## 2. Server Streaming RPC（服务端流式调用）

### 原理

客户端发送一条请求，服务端返回一个**消息流**。服务端可以持续发送多条消息，直到流结束。基于 HTTP/2 的多路复用特性，所有消息在同一个连接上传输。

```
Client                    Server
  │                         │
  │ ── Request Message ──>  │
  │                         │
  │ <── Response Msg 1 ──── │
  │ <── Response Msg 2 ──── │
  │ <── Response Msg 3 ──── │
  │ <── (stream end) ────── │
  │                         │
```

### Proto 定义

```protobuf
service OrderService {
  // 关键字：returns 前面加 stream
  rpc ListOrders(ListOrdersRequest) returns (stream OrderItem);
}
```

### 在 RpcCall 中的实现

**后端** (`caller.go` - `InvokeServerStream`)：
1. 建立连接，发送请求消息
2. 调用 `stub.InvokeRpcServerStream()` 获取流对象
3. 在 goroutine 中循环调用 `stream.RecvMsg()` 接收消息
4. 每收到一条消息，通过 `onMessage` 回调通知前端（Wails Events）
5. 收到 `io.EOF` 表示流结束，通过 `onDone` 回调发送汇总结果

**前端** (`useGrpc.ts`)：
- 监听 `stream:message` 事件，实时展示每条消息
- 监听 `stream:done` 事件，获取最终结果（状态码、耗时、headers/trailers）
- 多条消息用 `---` 分隔显示在响应面板中

### 请求体格式

与 Unary 相同，是单个 JSON 对象：

```json
{
  "userId": "12345",
  "pageSize": 50
}
```

### 适用场景

- 拉取大量数据（分批返回而非一次性返回）
- 服务端推送事件/通知
- 实时日志/监控数据流

---

## 3. Client Streaming RPC（客户端流式调用）

### 原理

客户端发送一个**消息流**（多条消息），服务端在接收完所有消息后返回一条汇总响应。适用于批量数据提交场景。

```
Client                    Server
  │                         │
  │ ── Request Msg 1 ────>  │
  │ ── Request Msg 2 ────>  │ (缓存接收)
  │ ── Request Msg 3 ────>  │
  │ ── (stream end) ──────> │
  │                         │ (处理所有消息)
  │ <── Response Message ── │
  │                         │
```

### Proto 定义

```protobuf
service UploadService {
  // 关键字：参数前面加 stream
  rpc UploadChunks(stream FileChunk) returns (UploadResult);
}
```

### 在 RpcCall 中的实现

**后端** (`caller.go` - `InvokeClientStream`)：
1. 建立连接，调用 `stub.InvokeRpcClientStream()` 获取流对象
2. 解析请求体：
   - 如果是 **JSON 数组** `[{...}, {...}]`，逐条发送每个元素
   - 如果是 **单个 JSON 对象** `{...}`，作为一条消息发送
3. 调用 `stream.CloseAndReceive()` 关闭发送流并等待服务端响应
4. 返回响应结果

**前端** (`useGrpc.ts`)：
- 直接 `await window.go.main.App.InvokeClientStream(request)` 获取响应
- 与 Unary 类似的同步等待模式

### 请求体格式

使用 **JSON 数组** 发送多条消息：

```json
[
  {"chunkIndex": 0, "data": "base64data1..."},
  {"chunkIndex": 1, "data": "base64data2..."},
  {"chunkIndex": 2, "data": "base64data3..."}
]
```

也可以发送单条消息（退化为类似 Unary 的效果）：

```json
{"chunkIndex": 0, "data": "base64data..."}
```

### 适用场景

- 文件分片上传
- 批量数据导入
- IoT 设备批量上报传感器数据

---

## 4. Bidirectional Streaming RPC（双向流式调用）

### 原理

客户端和服务端都可以发送消息流。双方的流是独立的，可以按任意顺序读写。这是最灵活也最复杂的调用模式。

```
Client                    Server
  │                         │
  │ ── Request Msg 1 ────>  │
  │ <── Response Msg 1 ──── │
  │ ── Request Msg 2 ────>  │
  │ ── Request Msg 3 ────>  │
  │ <── Response Msg 2 ──── │
  │ ── (stream end) ──────> │
  │ <── Response Msg 3 ──── │
  │ <── (stream end) ────── │
  │                         │
```

### Proto 定义

```protobuf
service ChatService {
  // 关键字：参数和返回值前面都加 stream
  rpc Chat(stream ChatMessage) returns (stream ChatMessage);
}
```

### 在 RpcCall 中的实现

**后端** (`caller.go` - `InvokeBidiStream`)：
1. 建立连接，调用 `stub.InvokeRpcBidiStream()` 获取双向流对象
2. **发送阶段**：解析请求体（JSON 数组或单对象），逐条调用 `stream.SendMsg()` 发送，然后 `stream.CloseSend()` 关闭发送端
3. **接收阶段**（goroutine 中）：循环调用 `stream.RecvMsg()` 接收服务端消息
   - 每收到一条消息，通过 `onMessage` 回调实时通知前端
   - 收到 `io.EOF` 表示服务端流结束
4. 通过 `onDone` 回调发送汇总结果

**前端** (`useGrpc.ts`)：
- 与 Server Streaming 一样监听 `stream:message` 和 `stream:done` 事件
- 实时展示接收到的每条消息

### 请求体格式

与 Client Streaming 相同，使用 JSON 数组：

```json
[
  {"text": "你好", "userId": "user1"},
  {"text": "在吗？", "userId": "user1"}
]
```

### 适用场景

- 实时聊天
- 多人协作编辑
- 游戏状态双向同步
- 语音/视频通话信令

---

## 技术要点

### HTTP/2 基础

gRPC 使用 HTTP/2 作为传输层，关键特性：
- **多路复用**：同一个 TCP 连接上可以并行传输多个 stream
- **头部压缩 (HPACK)**：减少 metadata 传输开销
- **流控制**：独立的流级别和连接级别流控

### Protobuf 序列化

所有 gRPC 消息使用 Protocol Buffers 编码：
- 相比 JSON，二进制格式体积更小、解析更快
- 强类型约束，编译期检查
- 在 RpcCall 中，通过 `jhump/protoreflect` 实现动态消息构建，无需预编译 proto

### Metadata（元数据）

类似 HTTP Headers，gRPC Metadata 分为：
- **Request Metadata**：客户端发送的请求头（如认证 token、trace ID）
- **Response Headers**：服务端返回的响应头（在第一条消息之前）
- **Response Trailers**：服务端返回的尾部元数据（在流结束时，包含 status code）

### TLS/mTLS

RpcCall 支持三种连接模式：
- **Insecure**：不加密（开发环境）
- **TLS**：单向 TLS，客户端验证服务端证书（需要 CA 证书）
- **mTLS**：双向 TLS，双方互相验证（需要 CA 证书 + 客户端证书 + 客户端私钥）
