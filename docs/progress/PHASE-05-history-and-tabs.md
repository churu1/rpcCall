# Phase 5: 历史记录与多标签页 - 已完成

## 完成的功能点

1. **SQLite 历史记录存储** (`internal/history/store.go`)
   - 纯 Go SQLite (modernc.org/sqlite, 无需 CGO)
   - 数据库自动创建在 `~/Library/Application Support/RpcCall/history.db`
   - 保存完整的请求和响应数据 (body, metadata, headers, trailers, status, timing)
   - 支持 List / GetDetail / Delete / ClearAll 操作

2. **自动保存历史**
   - 所有四种调用模式完成后自动保存到 SQLite
   - 对流式调用，在流结束后保存

3. **历史记录面板 UI** (`components/history/HistoryPanel.tsx`)
   - 底部可折叠面板
   - 显示: 状态图标 / 时间 / 方法名 / 地址 / 耗时
   - 点击条目: 重放请求 (创建新标签页并填充请求参数)
   - 单条删除 / 全部清除
   - 自动刷新 (每 5 秒)

4. **多标签页** (Phase 1 已实现, Phase 5 完善)
   - zustand store 管理标签页状态
   - 新增 TLS 相关字段 (useTls, certPath, keyPath, caPath)
   - 从历史重放时自动创建标签页并恢复参数

## 关键文件

| 文件 | 变更 |
|------|------|
| `internal/history/store.go` | 完整重写 SQLite 历史记录 |
| `app.go` | 新增 history 集成 + GetHistory/GetHistoryDetail/DeleteHistory/ClearHistory |
| `main.go` | 添加 OnShutdown 回调关闭数据库 |
| `frontend/src/components/history/HistoryPanel.tsx` | 新建历史面板 |
| `frontend/src/components/layout/AppLayout.tsx` | 集成 HistoryPanel |

## 当前项目状态

- `wails build` 成功 (6.5 秒)
- 完整的历史记录存储和展示
- 多标签页完全可用

## 下一步 (Phase 6)

- 错误处理优化
- 深色/浅色主题切换
- macOS .app 最终打包
