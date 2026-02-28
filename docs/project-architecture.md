# RpcCall 项目架构与技术栈详解

---

## 一、项目概述

RpcCall 是一款 macOS 桌面端 gRPC 调试工具，类似于 BloomRPC / Postman for gRPC。  
支持 Proto 文件导入、服务反射、四种 gRPC 调用模式、TLS/mTLS、请求历史、多标签页等功能。

---

## 二、技术栈总览

| 层级 | 技术 | 版本 | 说明 |
|------|------|------|------|
| **桌面框架** | Wails v2 | 2.11.0 | Go + Web 前端的桌面应用框架，替代 Electron |
| **后端语言** | Go | 1.24 | 负责 gRPC 调用、Proto 解析、数据持久化 |
| **前端框架** | React | 18.2 | UI 渲染 |
| **前端语言** | TypeScript | 5.3 | 类型安全 |
| **构建工具** | Vite | 5.4 | 前端打包，开发热重载 |
| **CSS 框架** | TailwindCSS | 4.2 | 原子化 CSS，通过 Vite 插件集成 |
| **UI 组件库** | Radix UI | 各组件独立版本 | 无样式基础组件（Dialog、Popover、Select 等） |
| **图标库** | Lucide React | 0.575 | 轻量 SVG 图标 |
| **状态管理** | Zustand | 5.0 | 轻量级 React 状态管理 |
| **gRPC 库** | google.golang.org/grpc | 1.79 | Go gRPC 客户端 |
| **Proto 解析** | jhump/protoreflect | 1.18 | 动态 Proto 解析、反射、JSON 生成 |
| **数据库** | SQLite (modernc.org/sqlite) | 1.46 | 纯 Go 实现，无 CGO 依赖 |

---

## 三、架构设计

### 3.1 整体架构图

```
┌─────────────────────────────────────────────────────┐
│                    macOS 窗口 (Wails)                │
│  ┌───────────────────────────────────────────────┐  │
│  │              React 前端 (WebView)              │  │
│  │  ┌─────────┐ ┌──────────┐ ┌────────────────┐ │  │
│  │  │ServiceTree│ │RequestEditor│ │ResponseViewer │ │  │
│  │  └─────────┘ └──────────┘ └────────────────┘ │  │
│  │  ┌─────────┐ ┌──────────┐ ┌────────────────┐ │  │
│  │  │AddressBar│ │HistoryPanel│ │CommandPalette │ │  │
│  │  └─────────┘ └──────────┘ └────────────────┘ │  │
│  │         │ Wails Bindings (IPC)  │              │  │
│  └─────────┼───────────────────────┼──────────────┘  │
│            ▼                       ▼                  │
│  ┌─────────────────────────────────────────────────┐ │
│  │                Go 后端                           │ │
│  │  ┌──────────┐ ┌───────────┐ ┌───────────────┐  │ │
│  │  │ProtoParser│ │  Caller   │ │ReflectionClient│  │ │
│  │  └──────────┘ └───────────┘ └───────────────┘  │ │
│  │  ┌──────────┐ ┌───────────┐ ┌───────────────┐  │ │
│  │  │  Logger  │ │  History  │ │  Connection   │  │ │
│  │  │          │ │  (SQLite) │ │  (TLS/mTLS)   │  │ │
│  │  └──────────┘ └───────────┘ └───────────────┘  │ │
│  └─────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────┘
         │                              │
         ▼                              ▼
   ┌──────────┐                 ┌──────────────┐
   │ .proto   │                 │ gRPC Server  │
   │  文件系统 │                 │ (远程服务)    │
   └──────────┘                 └──────────────┘
```

### 3.2 通信机制

**前端 → 后端**：通过 Wails Bindings 调用 Go 方法，自动生成 TypeScript 类型声明。  
前端调用方式：`window.go.main.App.MethodName(args)`，返回 `Promise`。

**后端 → 前端**：通过 Wails Events 推送（用于流式 RPC 的实时消息）。  
后端发送：`runtime.EventsEmit(ctx, "stream:message", data)`  
前端监听：`window.runtime.EventsOn("stream:message", callback)`

**前端组件间通信**：通过 DOM CustomEvent（`rpccall:invoke`、`rpccall:import-file` 等），  
由 CommandPalette 发出，ServiceTree / AddressBar 监听。

---

## 四、目录结构

```
RpcCall/
├── main.go                          # 应用入口，Wails 配置
├── app.go                           # IPC 桥接层，暴露所有后端方法给前端
├── go.mod / go.sum                  # Go 模块依赖
├── wails.json                       # Wails 项目配置
│
├── internal/                        # Go 内部包（不对外暴露）
│   ├── grpc/
│   │   ├── caller.go                # gRPC 动态调用引擎（四种模式）
│   │   ├── connection.go            # TLS/mTLS 连接配置
│   │   ├── proto_parser.go          # Proto 文件解析与 import 解析
│   │   ├── reflection.go            # gRPC 服务反射客户端
│   │   └── codec.go                 # MethodDescriptor 查找辅助
│   ├── history/
│   │   └── store.go                 # SQLite 存储（历史、地址、Proto 来源）
│   ├── logger/
│   │   └── logger.go                # 文件日志
│   └── models/
│       └── types.go                 # 共享数据模型
│
├── frontend/                        # React 前端
│   ├── index.html                   # HTML 入口
│   ├── package.json                 # NPM 依赖
│   ├── vite.config.ts               # Vite 构建配置
│   ├── tsconfig.json                # TypeScript 配置
│   └── src/
│       ├── App.tsx                  # 根组件 + ErrorBoundary
│       ├── main.tsx                 # React 挂载入口
│       ├── index.css                # 全局样式 + 主题变量
│       ├── lib/utils.ts             # cn() 工具函数
│       ├── store/
│       │   ├── app-store.ts         # 全局状态（Proto、Tab、侧边栏）
│       │   └── theme-store.ts       # 主题状态（深色/浅色）
│       ├── hooks/
│       │   └── useGrpc.ts           # gRPC 调用 Hook
│       ├── types/
│       │   └── wails.d.ts           # Wails 绑定类型声明
│       └── components/
│           ├── layout/
│           │   ├── AppLayout.tsx     # 主布局（标题栏、侧边栏、内容区）
│           │   └── TabBar.tsx        # 标签页栏
│           ├── service-tree/
│           │   └── ServiceTree.tsx   # 服务树（Proto 导入、分组、展开收起）
│           ├── connection/
│           │   ├── AddressBar.tsx    # 地址栏（输入、保存、下拉选择）
│           │   └── TlsConfig.tsx     # TLS 配置面板
│           ├── editor/
│           │   └── RequestEditor.tsx # 请求编辑器（Body、Metadata、TLS）
│           ├── response/
│           │   └── ResponseViewer.tsx# 响应查看器（Body、Headers、Trailers）
│           ├── search/
│           │   └── SearchBar.tsx     # 文本搜索组件 + 高亮
│           ├── history/
│           │   └── HistoryPanel.tsx  # 历史记录面板
│           └── command-palette/
│               └── CommandPalette.tsx# 命令面板（⌘K）
│
├── build/                           # 打包资源
│   ├── appicon.png                  # 应用图标
│   └── darwin/
│       └── Info.plist               # macOS 应用元数据
│
├── docs/                            # 项目文档
│   ├── project-architecture.md      # 本文档
│   ├── review-report.md             # 代码审查报告
│   ├── grpc-call-types.md           # gRPC 四种调用模式详解
│   └── progress/                    # 开发阶段记录
│       ├── PHASE-01 ~ PHASE-06
│
├── dist/                            # 分发包
│   └── README.txt                   # 安装说明
│
└── logs/
    └── rpccall.log                  # 运行日志
```

---

## 五、后端模块详解

### 5.1 入口层

#### `main.go` — 应用启动

- 使用 `//go:embed all:frontend/dist` 将前端产物嵌入二进制
- 配置 Wails 窗口（1280x800，最小 900x600）
- macOS 特殊配置：透明标题栏、隐藏标题文字、全尺寸内容区
- 初始化 Logger，注册 `OnStartup` / `OnShutdown` 生命周期钩子

#### `app.go` — IPC 桥接层

`App` 结构体是前后端通信的核心，所有公开方法自动暴露给前端：

| 方法 | 功能 |
|------|------|
| `OpenProtoFileDialog` | 打开文件选择器导入 .proto |
| `OpenProtoDirDialog` | 打开目录选择器批量导入 |
| `ParseProtoFiles` | 解析 proto 文件 |
| `ListServicesViaReflection` | 通过 gRPC 反射获取服务列表 |
| `GetMethodTemplate` | 生成方法的默认 JSON 请求模板 |
| `InvokeUnary` | 一元 RPC 调用 |
| `InvokeServerStream` | 服务端流调用 |
| `InvokeClientStream` | 客户端流调用 |
| `InvokeBidiStream` | 双向流调用 |
| `SaveAddress` / `ListAddresses` / `UpdateAddress` / `DeleteAddress` | 地址管理 |
| `LoadSavedProtos` / `ListProtoSources` / `DeleteProtoSource` / `ClearProtoSources` | Proto 来源持久化 |
| `GetHistory` / `GetHistoryDetail` / `DeleteHistory` / `ClearHistory` | 历史记录 |
| `SelectCertFile` | TLS 证书文件选择 |

### 5.2 gRPC 核心 (`internal/grpc/`)

#### `proto_parser.go` — Proto 文件解析引擎

**核心能力**：
- 基于 `jhump/protoreflect/desc/protoparse` 解析 `.proto` 文件
- 自动解析 import 路径：收集主目录 → 添加兄弟目录 → 按深度排序
- 构建文件索引（`buildFileIndex`）用于 basename / suffix 匹配
- 自定义 `Accessor` 实现多级 import 解析：
  1. `google/protobuf/*` → 使用内置描述符
  2. 绝对路径 → 直接打开
  3. 标准 import 路径解析
  4. basename 索引查找
  5. suffix 匹配
- `ParseDirectory` 支持批量解析 + 单文件回退（容错）
- `GenerateDefaultJSON` 递归生成请求模板（深度限制 5 层，防循环引用）

#### `caller.go` — gRPC 动态调用引擎

四种调用模式的实现：

| 模式 | 实现方式 |
|------|----------|
| **Unary** | `stub.InvokeRpc` + 30s 超时 |
| **Server Stream** | `stub.InvokeRpcServerStream` + goroutine 接收 |
| **Client Stream** | `stub.InvokeRpcClientStream`，支持单消息或 JSON 数组 |
| **Bidi Stream** | `stub.InvokeRpcBidiStream`，goroutine 内发送+接收 |

所有调用都：
- 通过 `findMethodDescriptor` 从 parser 或 reflection 查找方法描述符
- 使用 `dynamic.Message` 进行 JSON ↔ Protobuf 转换
- 支持自定义 Metadata
- 返回 Headers / Trailers / StatusCode / ElapsedMs

#### `connection.go` — TLS 连接

- 无 TLS：`insecure.NewCredentials()`
- 仅 CA：验证服务端证书
- mTLS：CA + 客户端证书/密钥

#### `reflection.go` — 服务反射

- 连接目标服务器，通过 gRPC Reflection API 获取服务列表
- 缓存 `ServiceDescriptor` 供后续调用使用
- 自动过滤 `grpc.reflection.*` 内部服务

### 5.3 数据持久化 (`internal/history/`)

#### `store.go` — SQLite 存储

三张表：

| 表 | 字段 | 用途 |
|----|------|------|
| `history` | id, timestamp, address, service_name, method_name, request_body, request_metadata, response_body, response_headers, response_trailers, status_code, elapsed_ms, error_msg | 请求历史 |
| `saved_addresses` | id, name, address (UNIQUE), created_at | 保存的调用地址 |
| `saved_proto_sources` | id, source_type, path (UNIQUE), import_paths (JSON), created_at | Proto 文件来源 |

特点：
- 使用 `modernc.org/sqlite`（纯 Go，无 CGO）
- 参数化查询防 SQL 注入
- `ON CONFLICT ... DO UPDATE` 实现 upsert
- 数据库位置：`~/Library/Application Support/RpcCall/history.db`

### 5.4 日志 (`internal/logger/`)

- 写入 `logs/rpccall.log`（项目目录下）
- 支持 `Info` / `Error` 两个级别
- 包含时间戳、文件名、行号

### 5.5 数据模型 (`internal/models/`)

```go
type GrpcRequest struct {
    Address, ServiceName, MethodName, Body string
    Metadata []MetadataEntry
    UseTLS bool; CertPath, KeyPath, CaPath string
}

type GrpcResponse struct {
    Body string; Headers, Trailers []MetadataEntry
    StatusCode string; ElapsedMs int64; Error string
}

type ProtoFile struct {
    Path string; Services []ServiceDefinition
}

type ServiceDefinition struct {
    Name, FullName string; Methods []ServiceMethod
}

type ServiceMethod struct {
    ServiceName, MethodName, FullName string
    MethodType MethodType  // unary | server_streaming | client_streaming | bidi_streaming
    InputTypeName, OutputTypeName string
}
```

---

## 六、前端模块详解

### 6.1 状态管理

#### `app-store.ts` — 全局应用状态

```
AppState
├── protoFiles: ProtoFile[]        # 已加载的 Proto 文件
├── tabs: Tab[]                     # 请求标签页
├── activeTabId: string             # 当前活跃标签
├── sidebarWidth: number            # 侧边栏宽度
└── actions: addProtoFile, removeProtoFile, clearProtoFiles,
             addTab, removeTab, setActiveTab, updateTab, ...
```

每个 `Tab` 包含：address、method、requestBody、responseBody、metadata、TLS 配置、loading 状态、耗时、状态码。

#### `theme-store.ts` — 主题状态

- 支持 dark / light 两套主题
- 通过修改 CSS 自定义属性（`--color-*`）实现主题切换
- 默认深色主题

### 6.2 组件架构

```
App (ErrorBoundary)
└── AppLayout
    ├── CommandPalette (⌘K 命令面板，全局浮层)
    ├── TitleBar (拖拽区域 + 主题切换)
    ├── TabBar (标签页管理)
    └── MainContent
        ├── Sidebar (可拖拽调整宽度)
        │   └── ServiceTree
        │       └── ProtoGroupNode → ServiceNode → MethodItem
        ├── ResizeHandle
        └── ContentArea
            ├── AddressBar (地址输入 + 保存 + 发送)
            ├── RequestPanel
            │   ├── SearchBar (⌘F)
            │   └── RequestEditor
            │       ├── Body (textarea, 支持 Tab 缩进)
            │       ├── Metadata (键值对 / JSON 模式)
            │       └── TlsConfig
            ├── ResponsePanel
            │   ├── SearchBar (⌘F)
            │   └── ResponseViewer
            │       ├── Body (高亮搜索)
            │       ├── Headers
            │       └── Trailers
            └── HistoryPanel (可折叠)
```

### 6.3 快捷键系统

| 快捷键 | 功能 | 实现位置 |
|--------|------|----------|
| `⌘K` | 打开/关闭命令面板 | CommandPalette |
| `⌘T` | 新建标签页 | CommandPalette |
| `⌘Enter` | 发送请求 | CommandPalette → AddressBar |
| `⌘R` | 刷新所有 Proto | CommandPalette → ServiceTree |
| `⌘F` | 搜索文本（Request/Response） | RequestEditor / ResponseViewer |
| `Esc` | 关闭搜索/命令面板 | SearchBar / CommandPalette |
| `Tab` | 插入两个空格 | RequestEditor textarea |

### 6.4 样式系统

- **TailwindCSS v4**：通过 `@tailwindcss/vite` 插件集成，无需 `tailwind.config.js`
- **CSS 变量主题**：在 `index.css` 中用 `@theme` 定义所有颜色变量
- **主题切换**：`theme-store.ts` 动态修改 `document.documentElement` 的 CSS 属性
- **工具函数**：`cn()` 基于 `clsx` + `tailwind-merge` 合并类名

---

## 七、数据流

### 7.1 Proto 导入流程

```
用户点击"导入" → Wails 文件对话框 → 选择文件/目录
    → Go: ProtoParser.ParseFiles() / ParseDirectory()
        → 解析 .proto → 提取 Service/Method
        → 保存来源到 SQLite (saved_proto_sources)
    → 返回 ProtoFile[] 给前端
    → Zustand: addProtoFile() → ServiceTree 渲染
```

### 7.2 gRPC 调用流程

```
用户点击 Send → useGrpc.send()
    → 构造 GrpcRequest (address, service, method, body, metadata, TLS)
    → Wails Binding: App.InvokeUnary(req) / InvokeServerStream(req) / ...
        → Go: Caller.findMethodDescriptor() → 查找方法描述符
        → Go: dialWithConfig() → 建立 gRPC 连接
        → Go: dynamic.Message.UnmarshalJSON() → JSON 转 Protobuf
        → Go: stub.InvokeRpc() → 发送请求
        → Go: 收集 response, headers, trailers, status
        → Go: history.Save() → 保存到 SQLite
    → 返回 GrpcResponse 给前端
    → Zustand: updateTab() → ResponseViewer 渲染
```

### 7.3 流式调用数据流

```
InvokeServerStream / InvokeBidiStream
    → Go goroutine 中循环接收消息
        → 每条消息: runtime.EventsEmit("stream:message", jsonStr)
            → 前端 EventsOn 回调 → updateTab(responseBody)
        → 完成时: runtime.EventsEmit("stream:done", finalResponse)
            → 前端 EventsOn 回调 → updateTab(final state)
```

---

## 八、构建与打包

### 8.1 开发模式

```bash
wails dev
```
- 前端 Vite 热重载
- Go 后端自动重编译
- WebView 连接 Vite dev server

### 8.2 生产构建

```bash
wails build
```
1. `npm install` → 安装前端依赖
2. `tsc && vite build` → TypeScript 编译 + Vite 打包 → `frontend/dist/`
3. `go:embed all:frontend/dist` → 嵌入到 Go 二进制
4. Go 编译 → `build/bin/RpcCall.app`

### 8.3 macOS 签名与分发

```bash
codesign --force --deep --sign - build/bin/RpcCall.app  # ad-hoc 签名
```

分发时需要接收方执行：
```bash
xattr -cr RpcCall.app  # 移除 macOS 隔离属性
```

---

## 九、关键设计决策

| 决策 | 选择 | 理由 |
|------|------|------|
| 桌面框架 | Wails v2 (非 Electron) | 二进制体积小（~20MB vs ~150MB），原生性能 |
| 后端语言 | Go (非 Rust/Tauri) | gRPC 生态成熟，protoreflect 库功能完善 |
| Proto 解析 | jhump/protoreflect | 支持动态解析、反射、JSON 生成，Go 生态最成熟 |
| SQLite 驱动 | modernc.org/sqlite | 纯 Go 实现，无 CGO，交叉编译友好 |
| 状态管理 | Zustand (非 Redux) | API 简洁，无 boilerplate，适合中小型应用 |
| CSS | TailwindCSS v4 + CSS 变量 | 原子化高效开发，变量实现主题切换 |
| 组件间通信 | DOM CustomEvent | 解耦命令面板与业务组件，无需 prop drilling |

---

## 十、依赖清单

### Go 直接依赖

| 包 | 用途 |
|----|------|
| `github.com/wailsapp/wails/v2` | 桌面应用框架 |
| `github.com/jhump/protoreflect` | Proto 文件解析、gRPC 反射、动态消息 |
| `google.golang.org/grpc` | gRPC 客户端 |
| `modernc.org/sqlite` | SQLite 数据库驱动 |

### 前端直接依赖

| 包 | 用途 |
|----|------|
| `react` / `react-dom` | UI 框架 |
| `zustand` | 状态管理 |
| `lucide-react` | 图标 |
| `@radix-ui/*` | 无样式基础组件 |
| `tailwindcss` / `@tailwindcss/vite` | CSS 框架 |
| `class-variance-authority` / `clsx` / `tailwind-merge` | 样式工具 |

---

## 十一、文件统计

| 类别 | 文件数 | 说明 |
|------|--------|------|
| Go 源码 | 10 | main.go, app.go, 8 个 internal 包文件 |
| TypeScript/TSX | 15 | 9 个组件, 2 个 store, 1 个 hook, 1 个类型声明, 2 个入口 |
| 配置文件 | 6 | wails.json, go.mod, package.json, vite.config.ts, tsconfig.json x2 |
| 文档 | 9 | 架构文档、审查报告、gRPC 文档、6 个阶段进度文档 |
| 总计 | ~40 | 不含生成文件和依赖 |
