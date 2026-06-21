# RpcCall

RpcCall 是一个基于 Wails、Go 和 React 的桌面端 gRPC 调试工具，面向日常接口联调、Proto 管理、请求复用、响应分析和压测场景。

## 主要功能

- 导入单个 `.proto` 文件或整个 Proto 目录，按项目隔离管理服务定义。
- 支持 gRPC Server Reflection，快速读取远程服务列表。
- 支持 Unary、Server Streaming、Client Streaming、Bidi Streaming 四类调用。
- 支持 TLS/mTLS、请求 Metadata、请求超时、地址收藏。
- 支持请求历史、历史对比、请求收藏集合、环境变量替换。
- 支持链式调用、Mock Server、Benchmark 压测、Payload Decode。
- 支持浅色/深色主题、中英文切换和全局字号调整。

## 界面字号调整

RpcCall 支持通过快捷键调整全局界面字号，适合高分屏、投屏演示或长时间阅读调试结果。

| 快捷键 | 功能 |
|--------|------|
| `Cmd + +` / `Cmd + =` | 调大字号 |
| `Cmd + -` | 调小字号 |
| `Cmd + 0` | 恢复默认字号 |

字号档位为 `80%`、`90%`、`100%`、`110%`、`120%`、`130%`、`140%`、`150%`。设置会保存到本地，下次启动自动恢复。

## 开发

开发模式支持热更新：

```bash
wails dev
```

前端改动会通过 Vite 热更新；后端 Go 绑定变更由 Wails 重新生成和加载。

## 构建

生成可分发的 macOS 应用：

```bash
wails build
```

构建产物位于：

```bash
build/bin/RpcCall.app
```
