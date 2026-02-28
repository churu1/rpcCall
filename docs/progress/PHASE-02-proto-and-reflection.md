# Phase 2: Proto 解析与服务浏览 - 已完成

## 完成的功能点

1. **Proto 文件解析** (`internal/grpc/proto_parser.go`)
   - 使用 `jhump/protoreflect/desc/protoparse` 解析 .proto 文件
   - 自动推断 import paths (以 proto 文件所在目录为准)
   - 提取 Service/Method/Message 定义，识别四种方法类型
   - 缓存 FileDescriptor 供后续调用使用

2. **gRPC Server Reflection** (`internal/grpc/reflection.go`)
   - 使用 `jhump/protoreflect/grpcreflect` 连接目标服务器
   - ListServices -> ResolveService 获取完整服务定义
   - 自动过滤 `grpc.reflection` 内置服务
   - 缓存 ServiceDescriptor 供后续调用使用

3. **JSON 模板自动生成** (`internal/grpc/proto_parser.go` 中的 GenerateDefaultJSON)
   - 递归遍历 Message 字段，生成带默认值的 JSON 模板
   - 支持所有基础类型、enum、嵌套 message、repeated 字段、map
   - 防止循环引用 (depth > 5 截断)

4. **前端 ServiceTree 连接后端**
   - "Import File" 按钮 -> `OpenProtoFileDialog()` -> macOS 原生文件选择器
   - "Import Dir" 按钮 -> `OpenProtoDirDialog()` -> 递归扫描目录下 .proto 文件
   - "Reflection" 按钮 -> `ListServicesViaReflection(address)` -> 使用当前标签页地址
   - 点击方法自动创建新标签页并填充 JSON 模板

5. **Wails 绑定方法** (`app.go`)
   - `OpenProtoFileDialog()` / `OpenProtoDirDialog()` — 文件选择
   - `ParseProtoFiles()` — 解析 proto 文件
   - `ListServicesViaReflection()` — 反射获取服务
   - `GetMethodTemplate()` — 获取请求 JSON 模板

## 关键文件

| 文件 | 变更 |
|------|------|
| `internal/grpc/proto_parser.go` | 完整实现 proto 文件解析 + JSON 模板生成 |
| `internal/grpc/reflection.go` | 完整实现 gRPC server reflection |
| `internal/grpc/codec.go` | FindMethodDescriptor 辅助函数 |
| `app.go` | 新增文件对话框 + proto 解析 + 反射绑定方法 |
| `frontend/src/components/service-tree/ServiceTree.tsx` | 连接后端，支持导入/反射/错误提示 |

## 当前项目状态

- `wails build` 成功
- 可导入 .proto 文件并在左侧树中展示服务和方法
- 可通过 gRPC 反射连接远程服务器获取服务列表
- 点击方法自动生成请求 JSON 模板

## 下一步 (Phase 3)

- 实现 `internal/grpc/caller.go` — 动态 gRPC 调用引擎
- 支持 Unary / Server Streaming / Client Streaming / Bidi Streaming
- Metadata (headers) 收发
- 前端 Send 按钮连接后端调用逻辑

## Go 新增依赖

- `github.com/jhump/protoreflect v1.18.0`
- `google.golang.org/grpc v1.79.1`
- `google.golang.org/protobuf v1.36.11`
