# 三大新功能使用指南

## 功能一：JSON 格式化 + 语法高亮

### 概述

Request Body 编辑器和 Response Viewer 现在支持 JSON 语法高亮，包括属性名（蓝色）、字符串值（绿色）、数字（黄色）、布尔值（紫色）、null（红色）的颜色区分。

### 使用方法

#### 编辑 Request Body

Request Body 面板已替换为带语法高亮的编辑器（基于 `react-simple-code-editor` + `prismjs`），输入 JSON 时实时高亮。Tab 键插入两空格缩进。

#### 格式化 / 压缩

在 Request Body tab 栏右侧有两个按钮：

- **Format** — 将 JSON 美化为缩进格式（`JSON.stringify(obj, null, 2)`）
- **Minify** — 将 JSON 压缩为单行格式

若 JSON 语法不合法，按钮操作将静默忽略。

#### 响应高亮

Response Viewer 中的 JSON 响应也使用 Prism 高亮渲染。当使用 Cmd+F 搜索时，自动切换为搜索高亮模式。

### 使用场景

- 从后端日志中复制一段压缩 JSON → 粘贴到 Request Body → 点击 Format 一键美化
- 查看复杂响应数据时，高亮帮助快速定位字段
- 发送前点击 Minify 去除多余空白

---

## 功能二：环境管理

### 概述

支持创建多个环境（如 dev / staging / prod），每个环境包含一组键值对变量。切换环境后，请求中的 `{{varName}}` 会在发送前自动替换为当前环境的变量值。

### 使用方法

#### 创建和管理环境

1. 点击标题栏右侧的 **环境选择器**（地球图标）→ 点击 **Manage Environments**
2. 在弹出的管理面板中：
   - 左侧列表显示所有环境，点击 **New Environment** 创建新环境
   - 选中一个环境后，右侧可编辑名称和变量键值对
   - 点击 **Add Variable** 添加新变量，填写 key 和 value
   - 点击 **Save** 保存修改

#### 切换环境

- 点击标题栏的环境选择器下拉菜单，选择一个环境即可激活
- 选择 **No Environment** 取消环境激活
- 也可通过 Cmd+K 命令面板搜索 "Select Environment"

#### 使用变量

在 Request Body、地址栏、Metadata 值中使用 `{{变量名}}` 语法引用变量。例如：

- 地址栏：`{{host}}:{{port}}`
- Request Body：`{"userId": "{{userId}}", "token": "{{authToken}}"}`
- Metadata：key=`authorization`，value=`Bearer {{token}}`

发送请求时，后端会自动将 `{{varName}}` 替换为当前激活环境中对应变量的值。

### 使用场景

- **多环境切换**：开发环境用 `localhost:50051`，测试环境用 `test.example.com:443`，通过切换环境一键更换
- **敏感数据管理**：将 token、密钥等存为环境变量，避免硬编码在请求中
- **团队协作**：不同开发者创建自己的本地环境变量

---

## 功能三：请求收藏 / Collection

### 概述

可将当前 Tab 的完整请求配置（地址 + 方法 + Body + Metadata + TLS）保存为收藏项，按集合（Collection）分组管理，需要时一键加载到新 Tab。

### 使用方法

#### 保存请求到集合

1. 在当前 Tab 配置好请求后，点击地址栏旁的 **保存图标**（💾），或通过 Cmd+K 搜索 "Save Request to Collection"
2. 在弹出的保存对话框中：
   - 输入请求名称（默认为 `serviceName/methodName`）
   - 从下拉框选择已有的 Collection，或输入新集合名称自动创建
   - 点击 **Save** 保存

#### 浏览和加载收藏

侧边栏底部的 **Collections** 区域展示所有集合和已保存的请求：

- 点击集合名称展开/收起请求列表
- 点击某个已保存的请求，自动创建新 Tab 并加载完整配置（地址、Body、Metadata、TLS 等）
- 悬浮显示删除按钮，可删除单个请求或整个集合

#### 管理集合

- 点击 Collections 区域右侧的 **+** 按钮创建新集合
- 集合内的请求和集合本身都支持删除操作

### 使用场景

- **常用请求快速复用**：将日常调试最频繁的 RPC 调用保存为收藏
- **按项目/模块分组**：创建 "用户服务"、"订单服务" 等集合，分类管理
- **调试场景保存**：保存特定参数组合的请求，方便重现问题
- **新人上手**：保存一组示例请求，新加入团队的成员可直接使用

---

## 快捷键汇总

| 快捷键 | 功能 |
|--------|------|
| Cmd+K | 打开命令面板 |
| Cmd+T | 新建 Tab |
| Cmd+Enter | 发送请求 |
| Cmd+R | 重新加载所有 Proto |
| Cmd+F | 搜索文本（Request Body / Response） |
| Tab | 在编辑器中插入两空格缩进 |
