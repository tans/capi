# Capi 核心流程计划

## 目标

覆盖认证、用户后台、管理后台以及 HTTP API 中转核心流程。Playground、产品 MCP、SDK、CLI 页面及专属文档移除，暂不作为实现或验收目标。BrowserOS neo MCP 仅用于浏览器测试，不属于产品功能。每条流程都要同时验证：

- 未登录访问控制
- 登录后页面与数据加载
- 表单校验与错误提示
- 成功提交后的状态、跳转和持久化
- 刷新页面后的状态恢复
- 中英文路由与文案
- 浏览器实际界面行为，而不只验证接口返回

## 测试环境

- 使用 Bun 启动 Next.js：`bun --bun next dev --port 3001`
- 浏览器入口：`http://localhost:3001`
- 使用 MCP 浏览器执行页面导航、填写、点击、等待和快照验证
- 使用独立测试数据库和测试账号
- 管理后台测试时使用临时 `CAPI_ADMIN_TOKEN`
- 每轮测试记录账号、页面 URL、操作步骤、预期结果、实际结果和失败截图/快照

## 2. 认证流程

### 注册

- [ ] 首页进入注册页
- [ ] 空表单提交，显示必填校验
- [ ] 非法邮箱校验
- [ ] 短密码校验
- [ ] 超长密码校验
- [ ] 密码确认不一致校验
- [ ] 姓名为空和超长校验
- [ ] 使用新测试账号注册
- [ ] 验证提交按钮加载状态和防重复提交
- [ ] 注册成功跳转 Dashboard
- [ ] 刷新页面仍保持登录态
- [ ] 重复邮箱显示明确错误

### 登录

- [ ] 未登录访问所有后台页面都跳转登录页
- [ ] 登录页支持中英文切换
- [ ] 错误邮箱/密码显示错误提示
- [ ] 正确凭据登录并跳转 Dashboard
- [ ] 登录按钮加载状态正确
- [ ] 刷新后 Cookie 会话仍有效
- [ ] 退出登录后访问后台再次跳转登录页
- [ ] 过期或无效 Cookie 不得进入后台

### 认证安全

- [ ] 未登录不能读取用户设置、密钥和后台数据
- [ ] 跨源认证请求被拒绝
- [ ] 管理权限与普通用户权限分离
- [ ] 登录错误不泄露账号是否存在

## 3. 普通用户后台

### Dashboard Overview

- [ ] 登录后进入 `/en/dashboard`
- [ ] 验证 `/zh/dashboard`
- [ ] 验证侧边栏导航和当前项高亮
- [ ] 验证 Daily spend、Cost by model、Recent activity
- [ ] 验证 Manage keys 和 Get started 跳转
- [ ] 验证无数据状态
- [ ] 验证刷新后数据不丢失

### API Keys

- [ ] 进入 `/dashboard/keys`
- [ ] 验证空状态
- [ ] 打开 Create key 表单
- [ ] 验证名称、Scope、预算字段校验
- [ ] 验证默认 Scope 编辑时不会重复拼接
- [ ] 创建测试密钥
- [ ] 验证只显示一次完整密钥或明确的 Reveal 行为
- [ ] 验证密钥脱敏展示
- [ ] 验证 Scope、预算、创建时间展示
- [ ] Reveal 密钥
- [ ] Revoke 密钥并确认
- [ ] 取消创建不产生数据
- [ ] 刷新后密钥仍存在
- [ ] 普通用户不能看到其他用户密钥

### Models

- [ ] 进入 `/dashboard/models`
- [ ] 验证 LLM、Image、Video、Music、Audio、Embeddings 模型
- [ ] 验证模型 ID、Family、Modality、Detail、Rate
- [ ] 打开完整模型目录
- [ ] 验证模型详情跳转
- [ ] 验证中英文价格单位和详情文案

### Usage

- [ ] 进入 `/dashboard/usage`
- [ ] 验证 Daily spend、By modality、By key、Top models
- [ ] 使用 Modality 下拉筛选
- [ ] 验证无结果状态
- [ ] 导出 CSV
- [ ] 验证 CSV 文件名、表头和数据
- [ ] 刷新页面后筛选状态符合预期

### Settings

- [ ] 进入 `/dashboard/settings`
- [ ] 加载账户名、Billing email、Account ID、Plan
- [ ] 修改账户名并保存
- [ ] 修改 Billing email 并保存
- [ ] 刷新确认数据持久化
- [ ] 切换 Budget thresholds、Failed generations、Weekly digest、Product updates
- [ ] 保存通知偏好
- [ ] 刷新确认开关状态持久化
- [ ] 验证保存成功反馈和更新时间
- [ ] 验证 Close account 的确认和危险操作保护，不在普通冒烟测试中实际关闭测试账号

## 4. 管理后台

### 管理权限

- [ ] 普通用户访问 `/dashboard/admin` 时显示无权限或要求管理凭据
- [ ] 未登录访问管理后台跳转登录
- [ ] 使用临时 Admin Token 连接管理后台
- [ ] 错误 Token 显示明确错误
- [ ] 正确 Token 建立管理会话
- [ ] 管理页刷新后权限状态符合设计

### 管理概览

- [ ] 验证 Live inventory and usage
- [ ] 验证渠道数量、启用状态、自动禁用渠道、Keys、请求和用量统计
- [ ] 验证 Models by enabled group
- [ ] 验证 Relay settings
- [ ] 点击 Refresh，确认数据重新加载

### 渠道管理

- [ ] 打开 Channels 标签
- [ ] 查看已有渠道名称、协议、URL、状态、模型、分组、优先级和权重
- [ ] 打开 Add channel 表单
- [ ] 验证 Name 必填
- [ ] 验证 Protocol 选项：OpenAI compatible、OpenAI、Anthropic、Gemini
- [ ] 验证 Base URL、Groups、Model IDs、Upstream keys 必填
- [ ] 验证 Priority 和 Weight 数值边界
- [ ] 验证 Random / Round robin 选择
- [ ] 验证自动禁用开关
- [ ] 创建一个本地测试渠道
- [ ] 保存后确认渠道出现在列表
- [ ] 编辑渠道并确认字段回填
- [ ] 修改渠道后确认保存
- [ ] Disable / Enable 渠道
- [ ] 删除测试渠道并确认
- [ ] 取消创建不产生数据

### 上游密钥管理

- [ ] 打开 Keys 标签
- [ ] 查看渠道密钥脱敏状态
- [ ] 新增测试上游密钥
- [ ] 编辑密钥标签或状态
- [ ] 删除测试密钥并确认
- [ ] 验证密钥内容不会在页面明文泄露

### Routing abilities

- [ ] 打开 Routing abilities 标签
- [ ] 查看模型能力和分组
- [ ] 新增或编辑测试能力配置
- [ ] 保存后刷新确认持久化
- [ ] 验证错误配置有明确提示

## 6. HTTP API 核心流程

- [ ] 文档中的 API 示例链接可打开
- [ ] API key 创建后复制示例可用
- [ ] `/v1/models` 能返回允许模型
- [ ] `/v1/chat/completions` 无 Key 返回 401
- [ ] 使用测试 Key 调用允许模型
- [ ] 超出 Scope 的请求被拒绝
- [ ] `/v1/me/balance` 返回当前账户余额
- [ ] `/v1/me/usage` 返回当前账户用量
- [ ] 异步任务创建、查询和完成状态可用

## 7. 多语言与响应式回归

- [ ] 每个认证页面验证 `/en` 和 `/zh`
- [ ] 每个后台页面验证 `/en` 和 `/zh`
- [ ] 语言切换不丢失登录态
- [ ] 语言切换不丢失表单状态（适用时）
- [ ] 中文文案不溢出
- [ ] 移动端侧边栏可操作
- [ ] 表格在窄屏可横向滚动
- [ ] 弹窗、下拉框、错误提示不被裁切

## 8. 每轮执行标准

每个流程必须记录：

1. 起始 URL
2. 登录状态
3. 使用的测试账号
4. 页面操作顺序
5. 预期结果
6. 实际结果
7. 是否有网络错误、控制台错误或服务端错误
8. 失败时保留 MCP snapshot 或 screenshot
9. 修复后从失败步骤重新跑完整链路

完成标准：

- 所有未登录保护路由跳转正确
- 注册、登录、退出登录完整可用
- 普通用户后台五个页面可访问且核心操作可完成
- 管理后台连接、渠道、密钥、路由能力流程可完成
- 关键失败路径有可理解错误提示
- 页面刷新和语言切换不破坏会话或已保存数据
- `bun run lint` 无 error
- 最终通过 MCP 浏览器完成一轮真实 UI 冒烟流程

## 2026-09-12 隔离执行记录

- 范围：跳过首页、公开内容页面与公开 Playground 的页面测试；认证页面从登录/注册 URL 直接进入。
- 环境：`http://localhost:3002`，临时源码副本与独立 `data/qa.sqlite`，未修改现有业务数据库；管理接口使用临时测试 Token。
- 测试账号：`auth-qa@example.test`、`dashboard-qa@example.test`、API QA2；凭据仅用于临时数据库，不记录完整会话或 API key。
- 以下为 HTTP 层证据，不代表浏览器表单、交互或视觉检查通过；原清单中需要 UI 验证的项目保留未勾选。

| 流程 | 操作与预期 | 实际结果 |
| --- | --- | --- |
| 注册校验 | 未登录 POST `/api/auth/register`：空对象、非法邮箱、短密码、1025 字符密码、空姓名、101 字符姓名；应拒绝 | 均 400，分别返回 invalid_email / invalid_password / invalid_name |
| 注册会话 | 新账号注册；应创建用户和安全会话 Cookie | 201；HttpOnly、SameSite=Lax、Max-Age=604800 |
| 重复邮箱 | 再次注册同一邮箱；应明确拒绝 | 409 email_in_use |
| 登录 | 正确凭据；错误密码 | 正确 200；错误 401 invalid_credentials |
| 跨源认证 | POST login，Origin 为外站；应拒绝 | 403 invalid_origin |
| 后台保护 | 未登录访问 en 下 dashboard、keys、models、usage、settings、admin | 六条路由均 307；dashboard 明确 Location=/en/login |
| 注销 | 已登录 POST logout；应撤销 Cookie | 200；Set-Cookie Max-Age=0；旧会话页面保护需继续验证 |
| 用户密钥 | 空列表→创建→列表→Reveal→撤销 | 初始 data=[]；创建返回完整 key；列表脱敏；授权 Reveal 返回完整 key；DELETE 204 |
| 用户设置 | 保存姓名、账单邮箱、weeklyDigest 后重新 GET | Persist QA / persist@example.test / true 均持久化 |
| 双语后台 | 已登录 GET en dashboard/keys/usage/settings、zh dashboard/models | 均 200；未完成浏览器布局与交互验证 |
| 管理鉴权 | overview 无 Token / 错误 Token / 正确 Token | 401 authentication_required / 401 invalid_admin_token / 200 |
| 管理渠道 | 创建→列表→编辑协议/轮询/自动禁用/分组/模型→删除 | 201/200；密钥脱敏；字段持久化；测试渠道已清理 |
| 管理密钥 | 创建→列表→删除 | 创建一次明文，列表脱敏，删除成功；最终 overview 渠道与 Keys 均为 0 |
| 渠道校验 | 缺名称、缺 URL、空 keys、空 models | 均 400；负 priority/weight 被接受，已交付修复 |
| API 鉴权 | 无 Key GET models / POST chat | `/api/v1` 下均 401 |
| API 查询 | 正确 Key GET models / balance / usage | 均 200；当前无渠道，models=[]；余额 $12.50；用量为零 |
| API 路径 | GET `/v1/models` | 307 语言重定向；实际实现位于 `/api/v1/models`，不算原计划路径通过 |
| 异步任务 | 正确 Key GET `/api/v1/tasks/abc` | 501 unsupported_operation，功能未实现，不标记通过 |
| MCP | GET `/mcp` | 307 语言重定向；仓库无 MCP HTTP endpoint，不标记通过 |

### 本轮失败与待复测

- 首页和公开内容页面的全面回归暂缓；Playground、产品 MCP、SDK、CLI 已从本轮产品范围移除，专属页面、导航和文档一并清理。
- 异步任务查询仍明确返回 501 unsupported_operation，未标记通过。
- `/v1/models` 是 locale 重定向路径；实际 API 为 `/api/v1/models`。
- BrowserOS neo 已通过 `http://127.0.0.1:9010/mcp` 连接；已真实执行注册密码不一致提示、提交禁用状态、注册跳转 Dashboard、刷新会话及退出返回对应语言首页。其余 UI 与移动端检查尚未完成。

### 修复后复测

- `bunx tsc --noEmit --pretty false --incremental false`：通过。
- `bun run lint`：通过，无 error 或 warning。
- 独立服务重启后，image-only key 调 chat 与 video 均先返回 `403 insufficient_scope`；撤销 key 后 models 返回 `401 invalid_api_key`。
- 独立服务重启后 keys GET 保留 scopes、预算和脱敏 secret；第二用户无法读取或撤销第一用户 key。
- 跨源 keys/settings/delete 均返回明确 `403 invalid_origin` JSON。
- 管理 priority/weight 的负数、null、字符串、Infinity 均 `400`；合法 0 及正数可保存。
