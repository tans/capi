# CAPI 团队版调整计划

基线：tans/capi main，提交 dd4a7aca1db19a64140aa3015038e72655dc6224。
核对日期：2026-09-14。本文基于 2026-09-14 当前工作区代码与提交审阅。团队空间、成员角色、邀请流程、空间资源页面、项目创建、渠道编辑、空间用量查询已实现；预算闭环、邀请邮件及邮箱验证仍待完成。空间用量已提供真实记录汇总、成员隔离和时间／项目／Key 筛选。

## 一、目标与范围

目标：保留现有 Next.js + Bun + SQLite，实现个人与团队共用一套工作空间能力。平台供应渠道，团队也可自建渠道；空间钱包独立，Key 预算是消费上限；复用现有管理界面，分开空间管理员和平台管理员权限。

首版验收：一个 10 人团队能创建空间、邀请成员、接入自有 OpenAI-compatible 渠道或使用平台渠道、发放成员 Key、按项目限额、查看真实费用、撤销访问。默认项目自动创建，用户不必先配置组织树。

首版不纳入：部门树、跨空间转账、成员子钱包、自定义角色编辑器、完整企业 SSO、渠道市场、复杂工作流。图片／视频与完整 Agent 协议另列后续工作，不阻挡团队主链路。

## 二、现有代码与必须调整的位置

| 现有位置 | 当前行为 | 调整 |
|---|---|---|
| lib/auth.ts | User 包含全局 role 和个人 balance | 用户保留身份和平台角色；余额从空间钱包查询；注册原子创建个人空间 |
| lib/relay/admin.ts | 以全局 admin 权限或管理员 Token 放行 | 明确为平台管理权限；新增空间权限校验 |
| lib/relay/store.ts | SQLite 迁移、全局渠道索引、Key 额度、最多 2000 条日志 | 增加空间归属列和账务表，所有租户查询有空间范围，去除固定条数清理 |
| lib/relay/types.ts | ApiKey 属于 userId，Channel 无归属 | Key 绑定空间／项目／主体，Channel 绑定平台或空间 |
| lib/relay/keys.ts | 鉴权只关注 Key；支持渠道后缀 | 解析调用上下文并验证成员状态；移除普通调用指定渠道 |
| lib/relay/selector.ts | group + model 全局选渠道 | 先计算空间授权的候选渠道，再执行现有优先级和权重 |
| lib/relay/relay.ts | Key 预扣、上游转发、正常流式 flush 结算 | 改成空间钱包与预算预留，请求幂等结算，覆盖断流和恢复 |
| lib/relay/pricing.ts | 全局倍率与按次价格 | 保留算价工具，增加价格快照与平台收费／BYOK 成本区分 |
| app/api/user/keys/* | 按 userId 管理，用户可自行设置额度／无限额 | 迁入空间接口；预算不产生资金；禁止读取已有 Key 明文 |
| app/api/user/redeem/route.ts | 兑换增加 users.balance_quota | 显式指定收款空间，事务写钱包与充值流水 |
| app/api/admin/users/[id]/route.ts | 可直接覆盖用户余额 | 平台用户管理只管身份；调账改为带原因的空间钱包流水 |
| app/api/admin/channels/* | 所有渠道由平台管理 | 保留平台渠道入口，新增空间渠道入口，共用服务与组件 |
| app/api/v1/me/balance/route.ts | 返回 Key 剩余额度，reserved 固定为 0 | 分别返回真实钱包可用额和当前 Key 预算；细分财务读取权限 |
| app/api/v1/me/usage/route.ts | 按 Key 汇总 quota | 保留 Key 查询范围，返回成本／实扣／估算状态；团队总账走空间接口 |
| app/api/v1/models/route.ts | 按全局分组选模型，价格来自静态目录 | 模型范围来自授权候选；调用价格来自计费配置，目录只提供元信息 |
| app/[locale]/(app)/dashboard/usage/page.tsx | 明细查询真实日志，但主图、总额、模型汇总仍用写死数据 | 全部改为同源 SQL 汇总，无记录显示空态 |
| components/dashboard/admin-console.tsx | requestAdmin 固定访问 /api/admin，支持管理员 Token | 抽取渠道编辑／列表组件，由页面传入明确 API 范围 |
| components/dashboard/admin-tools.tsx | 混合用户、价格、兑换码 | 分成平台用户、平台收费、钱包调整、兑换码等独立面板 |

## 三、固定业务规则

### 3.1 用户、个人空间与团队

1. User 是登录身份，可以加入多个空间。
2. Workspace.kind 为 personal 或 team；两者共用数据结构。
3. 注册自动创建一个个人空间、owner 成员关系、默认项目和钱包。
4. 个人空间不开放邀请；创建团队产生新空间，余额不自动搬迁。
5. 同一 Key 永久固定空间和项目，切换浏览器空间不会改变它的付款方。
6. Member 只管理本人 Key、查看本人使用；Admin 管空间成员、项目、渠道、预算和账单。
7. Owner 才能转移所有权、删除空间、任免 Admin。不能删除最后一个 Owner。
8. 平台 Admin 不是所有空间的普通成员；支持操作必须走专门的审计路径，不使用无条件租户鉴权绕过。

### 3.2 钱包与预算

- 钱包：空间实际资金，个人和团队分开。
- 预算：空间／项目／成员／Key 在周期内允许的消耗，不是可转移余额。
- 钱包 available = balance - reserved。
- 预算 available = limit - spent - reserved。
- unlimited 仅代表当前预算层无上限，仍受上级预算、平台调用收费、速率和空间状态约束。
- 成员不能自行抬高管理员分配的预算；可给自己 Key 设置更低的限制。
- 首版统一 USD，沿用现有 1 USD = 500000 内部单位；界面不显示积分。账务数值使用 INTEGER，价格计算使用明确的定点／舍入规则，限制 JS 安全整数范围。
- 月度预算按空间时区计算；时区默认 UTC。请求记住预留时的周期，跨月结算不能扣到另一周期。
- 首版预算口径固定为模型用量成本：平台渠道采用对客户的模型收费，私有渠道采用配置的成本估算。服务费单列，不提供复杂预算口径编辑器。

### 3.3 平台渠道与私有渠道

| 模式 | 可见性 | 钱包扣费 | 预算 |
|---|---|---|---|
| platform | 仅发布且对该空间授权的渠道 | 平台公布的模型费 | 按平台模型收费消耗 |
| workspace / BYOK | 仅所属空间 | 首版默认不重复收模型费 | 按空间配置的模型成本估算 |
| BYOK + 后续服务费 | 仅所属空间 | 仅单列的服务费 | 模型成本与服务费分别记录 |

私有渠道成本未知时标记 unknown，不把 0 当已知成本。启用金额硬预算时，要求配置足够准确的价格和输出上限；否则禁用该路由或明确采用请求数／Token 限制，不能虚称金额预算已生效。

路由模式首版仅三种：platform_only、private_only、private_then_platform。最后一种必须显式开启收费回退。默认不跨来源重试。使用 BYOK 且服务费为 0 的请求，不因为 CAPI 钱包为 0 而拒绝，但仍校验预算和授权。

group 保持路由用途，不能充当租户 ID。同名模型在多个来源出现时，先按来源政策确定候选，再按优先级与权重选择。

## 四、数据结构与文件组织

建议新增以下表；每张表承担一个清晰职责，不把账务事件混入配置 JSON。

| 表 | 关键字段／约束 |
|---|---|
| workspaces | id、kind、name、status、timezone、created_by、created_at；personal_owner_user_id 对个人空间唯一 |
| workspace_members | id、workspace_id、user_id、role、status；UNIQUE(workspace_id,user_id) |
| workspace_invites | workspace_id、email、token_hash、role、expires_at、accepted_at、revoked_at |
| projects | id、workspace_id、name、status、routing_mode、allowed_models、is_default |
| wallets | workspace_id 唯一、currency、balance_units、reserved_units |
| billing_requests | request_id 唯一、workspace_id、project_id、key_id、member_id、state、reserved_units、settled_units、price_snapshot、lease_expires_at |
| wallet_entries | id、workspace_id、request_id、kind、delta_units、idempotency_key 唯一、actor_user_id、reason、created_at |
| budgets | id、workspace_id、scope_type、scope_id、period_type、limit_units；作用域合法性在服务中验证 |
| budget_periods | budget_id、period_start、period_end、spent_units、reserved_units；组合唯一 |
| budget_reservations | request_id、budget_id、period_start、reserved_units；保存一次请求对应的多个预算预留 |
| audit_events | workspace_id 可空、actor、action、resource_type、resource_id、脱敏变更摘要、created_at |

wallet_entries 是不可随意编辑的资金变动日志，退款／调整用反向流水；它不宣称是完整会计总账。reservation 状态放 billing_requests，持有额度和余额分开核对。

现有表调整：

- api_keys：增加 workspace_id、project_id、subject_type(member/project)、member_id、created_by、revoked_at；明文 key_value 改 key_hash UNIQUE + prefix/last4；有效期、scope、模型限制保留。成员凭证和项目服务凭证明确区分。
- channels：增加 owner_type(platform/workspace)、workspace_id、status 独立列；CHECK 保证归属组合有效；上游凭证加密保存。模型映射和适配器配置可继续 JSON。
- usage_records：新增 request_id UNIQUE、workspace_id、project_id、member_id、channel_owner_type、upstream_cost_units、charged_units、budget_cost_units、usage_source、price_version、request_status；归属和时间索引使用真实列，详细 usage 保留 JSON。
- users：保留身份字段，role 改称 platform_role；旧 balance_quota 完成迁移后退出运行时读写。
- redeem_codes：保留 redeemed_by，再增加 credited_workspace_id 和账务事件引用；兑换必须唯一且原子。
- settings：现有全局配置仍仅平台可写；空间策略放空间／项目表，空间不能改全局 envOverrides。
- 外键与组合约束确保 project、member、key 属于同一空间。日志保留归属快照，Key 撤销后历史不消失。
- 索引至少覆盖 api_keys(key_hash)、api_keys(workspace_id)、channels(workspace_id,status)、usage_records(workspace_id,created_at)、usage_records(workspace_id,project_id,created_at)。

建议新增模块：

- lib/db.ts：共享 SQLite 连接与迁移入口；现有 store.ts 逐步引用，避免一次性重写。
- lib/workspaces/{service,permissions,store}.ts：空间、成员、邀请和授权。
- lib/billing/{wallet,budget,reservation,pricing,store}.ts：钱包、预算、幂等结算。
- lib/relay/context.ts：从有效 Key 解析不可由请求体覆盖的调用上下文。
- lib/relay/channel-access.ts：生成空间可访问渠道集合。
- lib/audit.ts：审计写入与脱敏。
- lib/secrets.ts：Key 哈希与上游凭证加密，主密钥由环境配置管理并支持版本轮换。

## 五、鉴权与撤权实现

浏览器接口：requireUser → requireWorkspacePermission(user,workspaceId,action) → 带 workspace_id 的资源查询。服务端组件同样执行授权。活动空间 Cookie 只做导航偏好，不作为授权凭据。

调用接口：验证 Key 哈希／状态／有效期 → 空间与项目状态 → 成员 Key 的成员状态 → scope、模型限制、预算和授权渠道。

- 对别的空间的资源 ID 返回无权访问或 404；列表、详情、修改、删除、测试、导出全部遵循一致规则。
- 每次调用查询成员状态，或使用可即时失效的版本缓存；初期优先数据库查询。
- 移除成员时，禁用该成员 Key；已发给客户端的凭证不能继续发起新请求。
- 项目服务 Key 不因创建人离职自动停用，管理员需确认归属并可轮换；界面明确显示这是项目凭证。
- 已开始的请求允许完成并结算，首版不承诺成员退出时立即中止所有在途流。
- 邀请使用随机高熵令牌、哈希保存、过期和单次使用。当前邮箱注册未验证所有权；接受定向邮箱邀请必须补邮箱验证，不能只比较可自行填写的邮箱字符串。
- 已有 API Key 明文查看接口停用；新 Key 仅创建时显示，遗失只能轮换。
- CAPI_ADMIN_TOKEN 仅保留平台机器操作，团队后台不显示输入框，不传给浏览器。
- 普通 Key 移除 -channelId 指定渠道能力；管理测试通过独立授权接口执行，沿用同样的请求安全、计费与日志规则。

## 六、调用与账务重构

实现顺序：

1. 校验请求实际字节大小、结构、模型和输出上限，不只信任 Content-Length。
2. 建立 RelayContext：workspaceId、projectId、subject、key、政策版本。
3. 获取授权候选渠道；无候选时返回失败，不预留资金。
4. 固定收费规则和成本价格快照。对可能回退的平台调用，在发生回退前重新检查钱包与预算。
5. 在同一 SQLite 短事务中检查并预留钱包和所有适用预算，写 billing_requests 与 budget_reservations。
6. 事务提交后调用上游，不能在数据库事务中等待网络。
7. 重试继续使用同一 request_id，记录每次 attempt。切换来源导致价格变化时原子调整预留，余额不足则停止回退。
8. 成功／失败／取消后走同一个 finalize，校验状态并幂等更新钱包、预算、流水和最终用量。
9. 后台恢复任务查找过期预留；使用心跳／租约区分活跃长流与失联请求。没有上游凭据时标为待核对，不盲目退款或重复扣款。
10. 支持 request_id 查明“哪个空间、谁、哪个项目、哪条渠道、实际扣多少钱、是否估算”。

金额字段口径：

- upstream_cost_units：平台或企业在供应商侧的成本；允许 unknown，保留估算标志。
- charged_units：本次从 CAPI 空间钱包实际收取的金额。
- budget_cost_units：计入预算的模型成本。
- usage_source：provider / estimated / unknown。
- price_snapshot：当时输入、输出、缓存等单价、币种和版本，后改价不能改历史账单。

预算边界：不能依赖按字符估算的 prompt 和正常 flush 就承诺绝对零超支。金额硬限制要求支持的模型具备可靠计数与最大输出约束；对未知工具循环、特殊计费项或未知价格不开放硬预算保证。实际用量超过预留时必须记录真实金额和差额，允许明确的欠费状态并阻止后续收费调用，不使用 MAX(0, balance-charge) 隐藏欠额。

流式处理：

- 分开连接／首字节超时、读空闲超时、最长请求时长。
- 使用 request.signal 传播客户端取消；取消后处理已发生用量。
- 正常完成、上游断流、客户端取消、进程中断分别记录状态。
- 统一 SSE 解析与使用量提取；没有 usage 时显示估算，不伪造准确账单。
- 已向客户端发送内容后不自动换渠道拼接回答；可能已执行上游操作的超时不盲目重试。
- 最终失败也留 usage/attempt 信息，但不默认存储提示词和回答正文。
- 渠道成本可能包含失败 attempt 的已知供应商费用，用户收费政策与内部成本分开。

## 七、自建渠道与路由实施

复用现有 Channel 的模型列表、映射、多 Key、权重、优先级、自动禁用配置。管理服务强制填入归属，不接受普通空间请求写 owner_type=platform 或其他空间 ID。

必须同时改动：

- selector.ts / store.ts 的 candidateIds、groupModels、abilities、describeRouting：所有结果受空间授权约束。
- 初期可维持按渠道所有者构建的索引，每次按空间政策求交集；若缓存有效路由，缓存键必须包含 workspaceId 与政策版本。
- channels GET 返回专用 DTO；keys、headers 中的凭证全部脱敏，不能把数据库 Channel 类型直接传给客户端。
- 修改渠道凭证使用“保留／替换／删除”显式操作，不能把脱敏字符串回写成凭证。
- 自建渠道只接 OpenAI-compatible；原生 Anthropic/Gemini 留给后续 adapter。
- 公有部署检查目标 URL、DNS 解析 IP 和重定向目的地，连接出口执行同等限制；不能仅靠字符串前缀判断。禁止把服务端鉴权头传到任意重定向主机。
- 私有部署可由平台配置受控内网白名单，空间管理员不能自行覆盖部署级限制。
- 渠道测试优先使用非收费探测；如发真实生成，显示预计花费并走既有收费／审计逻辑。
- 平台渠道只显示对外模型与健康摘要，空间无权读取其上游地址、凭证及内部错误原文。
- 统一模型白名单判断，解决列表与实际调用对空白名单、模型别名处理不一致的问题。
- 价格不足的模型不能使用无提示 fallback 倍率形成收费承诺。

## 八、接口调整清单

建议保持 /api/v1 模型调用路径不变，管理 API 显式带空间 ID。

| 接口 | 用途／权限 |
|---|---|
| GET /api/workspaces | 当前用户加入的空间 |
| POST /api/workspaces | 创建团队及默认项目／钱包／Owner |
| GET/PATCH /api/workspaces/:wid | 空间详情／设置 |
| GET /api/workspaces/:wid/members | 成员；根据角色返回必要信息 |
| PATCH/DELETE /api/workspaces/:wid/members/:mid | 改角色／移除；Owner/Admin 边界 |
| POST /api/workspaces/:wid/invites | 创建邀请 |
| POST /api/invites/accept | 验证令牌及已验证邮箱，事务加入 |
| DELETE /api/workspaces/:wid/invites/:iid | 撤销邀请 |
| GET/POST /api/workspaces/:wid/projects | 项目列表／创建 |
| PATCH /api/workspaces/:wid/projects/:pid | 预算关联、模型与路由政策、归档 |
| GET/POST /api/workspaces/:wid/keys | 本人或管理员可见 Key；创建不产生资金 |
| PATCH/DELETE /api/workspaces/:wid/keys/:kid | 策略修改／撤销，不能跨空间搬迁 |
| POST /api/workspaces/:wid/keys/:kid/rotate | 新建凭证并撤销旧凭证，明文一次显示 |
| GET/POST /api/workspaces/:wid/channels | 私有渠道列表／创建 |
| PATCH/DELETE /api/workspaces/:wid/channels/:cid | 修改／停用私有渠道 |
| POST /api/workspaces/:wid/channels/:cid/test | 授权测试 |
| GET /api/workspaces/:wid/routing | 脱敏路由预览 |
| GET /api/workspaces/:wid/billing | 钱包余额、冻结、支出和待核对金额 |
| POST /api/workspaces/:wid/redeem | 兑换到明确空间 |
| GET /api/workspaces/:wid/ledger | 分页资金流水，Owner/Admin |
| GET/PATCH /api/workspaces/:wid/budgets | 查看／设置预算；成员只可收紧本人 Key |
| GET /api/workspaces/:wid/usage | 空间汇总或本人用量，支持项目／成员／Key／时间筛选 |
| GET /api/workspaces/:wid/usage/export | 同权限导出 CSV |
| GET /api/workspaces/:wid/audit | 空间操作审计 |
| POST /api/admin/workspaces/:wid/adjustments | 平台调账，amount + reason + idempotencyKey |
| /api/admin/channels、pricing、redeem-codes、users | 保留平台职责，禁止供空间后台直接复用权限 |

旧 /api/user/keys 与 /api/user/redeem 若保留短期兼容，只映射到调用用户自己的个人空间；绝不依赖活动空间 Cookie 静默扣团队钱包。返回废弃提示并在文档标注迁移日期。新页面只使用新路径。

/api/v1/me/balance：默认返回当前 Key 的限额／有效可用状态；查看整个空间钱包需要单独财务 scope，由 Admin 授予。零余额或 Key 预算耗尽仍允许有权限的只读账单查询。把身份鉴权与付费调用额度检查分开。

## 九、界面实施

建议空间路由 /[locale]/dashboard/w/[workspaceId]/...；旧 /dashboard 只重定向到个人或最近有权访问的空间。平台入口 /[locale]/dashboard/admin 保留。

| 页面 | 调整 |
|---|---|
| app/[locale]/(app)/layout.tsx | 添加空间切换器；保持单侧导航，不再叠加团队侧栏 |
| dashboard/page.tsx | 改为重定向入口；概览移到空间页面 |
| 空间概览 | 本月费用、预算余量、调用成功率、最近错误，全部真实数据 |
| keys/page.tsx + key-manager.tsx | Key 归属项目／使用人、权限、预算；创建后一次显示；支持撤销和轮换 |
| models/page.tsx | 仅展示实际可用模型，标记平台／私有、收费／成本估算 |
| usage/page.tsx | 清除写死 daily、rows、$371.56 与按权重生成的 Key 费用 |
| 新 members 页面 | 邀请、角色、成员限额、禁用；个人空间隐藏 |
| 新 channels 页面 | 复用渠道表单，隐藏平台 Token、全局价格与平台用户管理 |
| 新 billing 页面 | 钱包、冻结、资金流水，与 BYOK 成本统计分开 |
| settings/page.tsx | 拆账户设置与空间设置；密码／姓名是全局，名称／政策是空间 |
| admin-console.tsx | 抽 ChannelTable、ChannelEditor、RoutingPreview，共享组件而非共享平台权限 |
| admin-tools.tsx | 平台用户表不再编辑余额；增加空间调账入口 |

项目首版作为 Key 表单和用量筛选项即可；默认一个项目，只有需要归集时再创建，不要求新增复杂项目首页。

界面权限只是体验控制，所有实际限制必须在服务器执行。切换空间后客户端查询缓存必须按 workspaceId 隔离，不能闪现上一个团队的账单。

## 十、迁移与切换

现有 store.ts 有 5 个迁移条目；在当前基线后追加迁移，不改写已应用条目。后续编号以实施时主分支为准。

推荐维护窗口切换：现有代码和新代码不能混用同一账务数据库。先备份、演练、生成迁移报告，再暂停写入与调用，执行迁移和验证。

1. 使用 SQLite 一致性备份，不能仅复制运行中的主 db 而忽略 WAL；记录版本与校验信息。
2. 新建空间、成员、项目、钱包及账务表。
3. 为每位历史用户建立个人空间、Owner、默认项目；迁移 users.balance_quota 为钱包期初余额并生成唯一 opening 流水。
4. Key 归入其 userId 对应个人空间；缺失用户或 userId 非有效归属的 Key 隔离禁用，生成待认领清单，不自动变成平台超级 Key。
5. 旧 remain_quota 不是可靠的真实资金来源，不能与用户余额直接相加。保留快照，将其作为 legacy Key 剩余使用上限；无限额度映射为无 Key 单独上限，但仍受钱包约束。若有线下已充值到 Key 的历史业务，需要在切换前核对凭证并生成独立调整流水，不能自动猜测。
6. 旧 Key 保持原始可调用字符串，保存哈希；检查重复 key_value 并形成冲突报告后再加唯一约束。停止旧明文读取和明文写入。
7. 所有现有渠道默认归平台所有，不自动放进任何团队；确认原本属于企业私有的渠道再按清单迁移。
8. 根据 Key 归属回填历史用量；Key 已删除无法归属的记录标记 legacy_unattributed，仅平台可查。历史缺少价格快照、供应商成本等信息时保留 unknown。
9. 保留旧余额、Key 额度和日志备份供核对；新系统运行时只读新账务，不做长期双写。
10. 对账通过后停用旧余额覆盖接口和 Key 额度资金接口。
11. 已经被 2000 条限制删除的历史不能恢复，也不能伪造完整月账单；页面标注历史覆盖起点。
12. 切换前验证钱包总额等于已核对期初总额；重复执行迁移不重复创建空间／期初余额／流水。

回滚：正式收新请求前可以恢复备份并回旧版本；收取新费用后不能直接覆盖恢复旧库，否则会丢账。必须先停止调用、导出新产生的流水并完成前向修复或受控回滚。交付文档明确这条边界。

## 十一、实施批次与验收

| 批次 | 主要交付 | 依赖／验收 |
|---|---|---|
| A：立即修复 | 关掉普通 Key 指定渠道；修无渠道退款与使用初始预扣值；停止创建额度即资金；清除假统计 | 若当前线上运行，先做补丁。钱包未接通前暂停新自助 Key 消费或仅保留已核对测试 Key |
| B：空间与迁移 | 表结构、个人空间迁移、空间权限、默认项目、Key 归属 | 同一人两个空间互不串数据；重复迁移幂等；孤儿记录有报告 |
| C：计费闭环 | 钱包、预算、reservation、ledger、价格快照、兑换与调账 | 并发不绕过限额；所有失败路径处理预留；幂等结算；零余额可查账 |
| D：私有渠道 | 渠道所有权、来源政策、路由索引隔离、凭证保护、BYOK 计费区分 | A 团队不能枚举或调用 B 渠道；私有失败不默认转收费平台 |
| E：团队前台 | 空间切换、成员邀请验证、角色、项目筛选、复用渠道管理界面 | 普通成员和 Admin 权限清楚；成员撤权立即影响新请求 |
| F：可交付试点 | 真实汇总、导出、审计、请求诊断、恢复任务、部署与备份说明、CI | 10 人试点完整走通；故障后账务可解释；构建及关键集成测试通过 |
| G：后续兼容 | 原生 Responses／Anthropic、流式工具调用、客户端兼容矩阵 | 按真实目标客户端验收；与团队数据模型解耦 |

B、C、D 可以分 PR，但在缺少租户隔离和计费闭环时不对外开放团队渠道。预算和计费测试随功能一起实现，不拖到最后。

针对关键风险的测试清单：

- 用户同时属于 A/B，篡改 wid、pid、kid、cid 均不能读取或操作另一个空间。
- 成员没有抬高自身上级预算、给自己开财务 scope 或创建平台渠道的能力。
- 个人消费不扣公司钱包，公司消费不扣个人钱包。
- 钱包 0：收费平台调用被拒，免费 BYOK 可调用，账单读取可用。
- 两个 Key 并发争用同一空间／成员／项目预算时不能各自绕过总上限。
- 空渠道、无可用上游 Key、上游 401/429/500、网络超时、错误 JSON 均有一致终态。
- 流式成功、断流、取消、进程终止／恢复、重复 finalize 不发生重复资金变动。
- 未知供应商 usage 或未知成本有显式标记；实际金额超过预留可追溯。
- 上个月预留、下个月结算的预算归属固定。
- 重复兑换、重复调账、重放同一结算不会重复入账。
- 改模型价格、改渠道名称、撤销 Key 后旧账单仍可解释。
- 私有渠道 DNS／重定向不能到未授权内网或泄漏上游凭证。
- 使用量 2001 条后不删掉前面的财务历史；按角色导出数据不泄漏其他成员详情。
- 邀请过期／撤销／重复接受／未验证邮箱不能误加入；最后 Owner 保护生效。
- 迁移前后用户、Key、渠道、已保留日志数量和已确认资金总额一致。

## 十二、文档与运行交付

更新 README.md，替换 create-next-app 默认说明：明确 Bun 运行时、SQLite 数据目录、初始化管理员方式、必要环境变量、凭证加密密钥、构建和启动命令、备份恢复、迁移流程。

增加 .env.example（仅占位）、备份／恢复与迁移演练脚本、健康检查、请求 ID 日志、费用未结算告警。CI 覆盖 bun test、类型检查、lint、build，使用临时数据库和模拟上游，不访问真实付费供应商。

更新 lib/api-spec.ts、content/docs/guides/authentication.md、platform-management/quickstart.md、quickstart.md、lib/i18n/dictionaries/{zh,en}.ts。标明图片／视频仍未支持，Responses 目前只支持简单非流式文本，不能借团队版上线声称完整工具调用兼容。

## 来源

- [审阅基线提交](https://github.com/tans/capi/commit/dd4a7aca1db19a64140aa3015038e72655dc6224)
- [数据库和迁移](https://github.com/tans/capi/blob/dd4a7aca1db19a64140aa3015038e72655dc6224/lib/relay/store.ts)
- [身份与角色](https://github.com/tans/capi/blob/dd4a7aca1db19a64140aa3015038e72655dc6224/lib/auth.ts)
- [Key 创建](https://github.com/tans/capi/blob/dd4a7aca1db19a64140aa3015038e72655dc6224/app/api/user/keys/route.ts)
- [Key 详情与明文](https://github.com/tans/capi/blob/dd4a7aca1db19a64140aa3015038e72655dc6224/app/api/user/keys/%5Bid%5D/route.ts)
- [中转主流程](https://github.com/tans/capi/blob/dd4a7aca1db19a64140aa3015038e72655dc6224/lib/relay/relay.ts)
- [渠道选择](https://github.com/tans/capi/blob/dd4a7aca1db19a64140aa3015038e72655dc6224/lib/relay/selector.ts)
- [模型与价格输出](https://github.com/tans/capi/blob/dd4a7aca1db19a64140aa3015038e72655dc6224/app/api/v1/models/route.ts)
- [后台组件](https://github.com/tans/capi/blob/dd4a7aca1db19a64140aa3015038e72655dc6224/components/dashboard/admin-console.tsx)
- [用量页面](https://github.com/tans/capi/blob/dd4a7aca1db19a64140aa3015038e72655dc6224/app/%5Blocale%5D/(app)/dashboard/usage/page.tsx)

