# Phase 4: TLS/mTLS 连接管理 - 已完成

## 完成的功能点

1. **TLS 连接管理** (`internal/grpc/connection.go`)
   - `CreateDialOptions()` 根据 TLS 配置创建 gRPC DialOption
   - 支持三种模式: Plaintext / TLS / mTLS
   - CA 证书: 自定义根证书池
   - mTLS: 加载客户端证书+密钥对

2. **Caller 集成 TLS**
   - 所有四种调用模式 (Unary/ServerStream/ClientStream/BidiStream) 均通过 `dialWithConfig()` 建立连接
   - 从请求参数中读取 TLS 配置

3. **前端 TLS 配置 UI** (`components/connection/TlsConfig.tsx`)
   - TLS 开关 (checkbox)
   - CA Certificate 文件选择
   - Client Certificate 文件选择 (mTLS)
   - Client Key 文件选择 (mTLS)
   - 通过 macOS 原生文件对话框选择文件

4. **RequestEditor 集成**
   - 新增 "TLS" 标签页
   - 启用 TLS 时标签显示激活标识 "TLS ●"

## 关键文件

| 文件 | 变更 |
|------|------|
| `internal/grpc/connection.go` | 完整实现 TLS/mTLS 连接配置 |
| `internal/grpc/caller.go` | 所有调用方法使用 dialWithConfig |
| `app.go` | 新增 SelectCertFile 绑定方法 |
| `frontend/src/components/connection/TlsConfig.tsx` | 新建 TLS 配置 UI |
| `frontend/src/components/editor/RequestEditor.tsx` | 添加 TLS 标签页 |
| `frontend/src/store/app-store.ts` | Tab 新增 useTls/certPath/keyPath/caPath 字段 |
| `frontend/src/hooks/useGrpc.ts` | 请求时传递 TLS 参数 |

## 当前项目状态

- `wails build` 成功 (6 秒)
- 支持 Plaintext / TLS / mTLS 三种连接模式
- 完整的证书文件选择 UI

## 下一步 (Phase 5)

- SQLite 历史记录存储
- 历史记录面板 UI
- 多标签页状态管理已基本完成 (zustand store)
