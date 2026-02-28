# Phase 1: 项目脚手架与基础架构 - 已完成

## 完成的功能点

1. **Wails v2.11.0 + React + TypeScript 项目初始化**
   - `wails init -n RpcCall -t react-ts` 创建基础项目
   - 升级 Wails CLI 和 Go 依赖到 v2.11.0 以兼容 Go 1.24

2. **前端依赖与工具链**
   - Vite 5 + React 18 + TypeScript 5
   - TailwindCSS v4 (通过 `@tailwindcss/vite` 插件)
   - 路径别名 `@/` 已配置
   - shadcn/ui 相关依赖: tailwind-merge, clsx, class-variance-authority, lucide-react
   - Radix UI 组件: tabs, scroll-area, separator, tooltip, dialog, select, popover, context-menu
   - zustand 状态管理

3. **深色主题 UI 布局** (BloomRPC/Postman 风格)
   - 顶部: macOS 透明标题栏 + 多标签页 TabBar
   - 左侧: 可拖拽调整宽度的 ServiceTree 侧边栏
   - 右上: AddressBar (地址输入 + 方法类型标识 + Send 按钮)
   - 右中左: RequestEditor (JSON Body + Metadata 切换)
   - 右中右: ResponseViewer (Response + Headers + Trailers 切换)

4. **Go 后端模块结构**
   - `internal/models/types.go` — 共享数据模型
   - `internal/grpc/caller.go` — 动态 gRPC 调用引擎 (骨架)
   - `internal/grpc/reflection.go` — gRPC 反射客户端 (骨架)
   - `internal/grpc/proto_parser.go` — .proto 文件解析 (骨架)
   - `internal/grpc/connection.go` — 连接管理 (骨架)
   - `internal/history/store.go` — SQLite 历史记录 (骨架)
   - `app.go` — Wails 绑定入口，连接前后端

5. **macOS 原生体验**
   - 透明标题栏 (TitlebarAppearsTransparent)
   - 窗口最小尺寸 900x600，默认 1280x800

## 关键文件清单

| 文件 | 职责 |
|------|------|
| `main.go` | Wails 应用入口，窗口配置 |
| `app.go` | Wails Binding struct，前后端 IPC 桥梁 |
| `wails.json` | Wails 项目配置 |
| `frontend/src/App.tsx` | React 入口 |
| `frontend/src/index.css` | TailwindCSS 主题变量 + 全局样式 |
| `frontend/src/store/app-store.ts` | zustand 状态管理 (tabs, protos, sidebar) |
| `frontend/src/components/layout/AppLayout.tsx` | 主布局 |
| `frontend/src/components/layout/TabBar.tsx` | 多标签页 |
| `frontend/src/components/service-tree/ServiceTree.tsx` | 服务浏览树 |
| `frontend/src/components/connection/AddressBar.tsx` | 地址栏 + 发送按钮 |
| `frontend/src/components/editor/RequestEditor.tsx` | 请求编辑器 |
| `frontend/src/components/response/ResponseViewer.tsx` | 响应查看器 |
| `internal/models/types.go` | 共享数据模型定义 |
| `internal/grpc/*.go` | gRPC 相关模块骨架 |
| `internal/history/store.go` | 历史记录模块骨架 |

## 当前项目状态

- `wails build` 成功，生成 macOS `.app` 在 `build/bin/RpcCall.app`
- 应用可启动并显示深色主题 UI 布局
- 所有 Go/TypeScript 代码编译通过，无错误
- 后端 gRPC 模块为骨架代码，功能在后续 Phase 实现

## 下一步 (Phase 2)

- 安装 `github.com/jhump/protoreflect` Go 依赖
- 实现 `internal/grpc/proto_parser.go` — 解析 .proto 文件
- 实现 `internal/grpc/reflection.go` — gRPC Server Reflection
- 前端 ServiceTree 连接后端，展示解析后的服务/方法树
- 自动生成请求 JSON 模板

## 环境信息

- Go: 1.24.3 darwin/arm64
- Node.js: v22.20.0
- Wails CLI: v2.11.0
- macOS (arm64)
