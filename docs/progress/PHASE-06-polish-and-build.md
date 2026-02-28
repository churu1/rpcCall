# Phase 6: 打磨与打包 - 已完成

## 完成的功能点

1. **深色/浅色主题切换**
   - `store/theme-store.ts` 管理主题状态
   - 标题栏右侧 Sun/Moon 图标按钮切换
   - 通过 CSS 变量动态切换所有颜色
   - 默认深色主题

2. **错误处理**
   - gRPC 调用错误: 返回 gRPC status code + error message
   - 文件导入错误: ServiceTree 内联错误提示
   - 反射连接错误: 超时处理 + 错误提示
   - TLS 配置错误: 在 connection.go 中验证并返回友好错误

3. **.gitignore 完善**
   - 忽略 build/bin, node_modules, dist, wailsjs 生成目录

4. **macOS .app 打包**
   - 最终 `.app` 大小: 19MB
   - 位置: `build/bin/RpcCall.app`
   - 透明标题栏 + 原生 macOS 窗口控件
   - 窗口大小: 1280x800 (最小 900x600)

## 最终项目文件结构

```
RpcCall/
├── main.go                          # Wails 入口 + 窗口配置
├── app.go                           # Wails 绑定 (12 个 API 方法)
├── go.mod / go.sum
├── wails.json
├── internal/
│   ├── grpc/
│   │   ├── caller.go                # 完整 gRPC 动态调用引擎
│   │   ├── reflection.go            # gRPC Server Reflection
│   │   ├── proto_parser.go          # Proto 文件解析 + JSON 模板生成
│   │   ├── connection.go            # TLS/mTLS 连接管理
│   │   └── codec.go                 # 辅助方法
│   ├── history/
│   │   └── store.go                 # SQLite 历史记录
│   └── models/
│       └── types.go                 # 共享数据模型
├── frontend/
│   ├── src/
│   │   ├── App.tsx
│   │   ├── main.tsx
│   │   ├── index.css                # TailwindCSS 主题
│   │   ├── lib/utils.ts             # cn() 工具
│   │   ├── types/wails.d.ts         # 全局类型声明
│   │   ├── store/
│   │   │   ├── app-store.ts         # zustand 主 store
│   │   │   └── theme-store.ts       # 主题 store
│   │   ├── hooks/
│   │   │   └── useGrpc.ts           # gRPC 调用 hook
│   │   └── components/
│   │       ├── layout/
│   │       │   ├── AppLayout.tsx     # 主布局
│   │       │   └── TabBar.tsx        # 多标签页
│   │       ├── service-tree/
│   │       │   └── ServiceTree.tsx   # 服务浏览树
│   │       ├── connection/
│   │       │   ├── AddressBar.tsx    # 地址栏 + 发送按钮
│   │       │   └── TlsConfig.tsx     # TLS 配置 UI
│   │       ├── editor/
│   │       │   └── RequestEditor.tsx # 请求编辑器
│   │       ├── response/
│   │       │   └── ResponseViewer.tsx# 响应查看器
│   │       └── history/
│   │           └── HistoryPanel.tsx  # 历史记录面板
│   ├── package.json
│   └── vite.config.ts
├── build/
│   └── bin/RpcCall.app               # macOS 应用包 (19MB)
└── docs/
    └── progress/                     # 开发进度文档
```

## Wails 绑定方法清单 (app.go)

| 方法 | 用途 |
|------|------|
| `OpenProtoFileDialog` | 打开文件选择器导入 .proto |
| `OpenProtoDirDialog` | 打开目录选择器批量导入 .proto |
| `ParseProtoFiles` | 解析 proto 文件 |
| `ListServicesViaReflection` | 通过反射获取远程服务列表 |
| `GetMethodTemplate` | 生成方法的 JSON 请求模板 |
| `InvokeUnary` | 执行 Unary gRPC 调用 |
| `InvokeClientStream` | 执行 Client Streaming 调用 |
| `InvokeServerStream` | 执行 Server Streaming 调用 |
| `InvokeBidiStream` | 执行 Bidi Streaming 调用 |
| `SelectCertFile` | TLS 证书文件选择 |
| `GetHistory` / `GetHistoryDetail` | 查询历史记录 |
| `DeleteHistory` / `ClearHistory` | 管理历史记录 |

## 如何运行

```bash
# 开发模式 (热重载)
wails dev

# 生产构建
wails build

# 运行构建的应用
open build/bin/RpcCall.app
```

## Go 依赖总览

- `github.com/wailsapp/wails/v2 v2.11.0` — 桌面框架
- `github.com/jhump/protoreflect v1.18.0` — Proto 解析/反射/动态调用
- `google.golang.org/grpc v1.79.1` — gRPC 框架
- `google.golang.org/protobuf v1.36.11` — Protobuf 运行时
- `modernc.org/sqlite v1.46.1` — 纯 Go SQLite
