# CAPI

## 基于 JEV 的新一代 AI 网关

CAPI 面向企业和团队提供统一的 AI 能力接入层。通过 JEV 负责智能路由与安全决策，在统一 API 下连接云端模型、本地模型以及图像、视频等多模态能力，帮助团队降低接入和维护成本。

## 核心能力

### 1. JEV 智能路由，减少 Token 消耗

根据任务需求选择合适的模型与处理路径，让简单任务用更经济的方式完成，复杂任务获得足够的能力，在保证效果的同时降低 Token 消耗。

### 2. JEV 安全决策，保护企业数据

在请求进入模型前识别敏感信息与潜在风险，并按企业策略决定如何处理，降低密钥泄露和敏感数据外传的风险。

### 3. 支持本地模型与开源 JEV 实现

可接入本地部署的模型，并支持基于开源 JEV 实现构建路由与决策能力，满足企业对部署方式和数据流向的自主控制需求。

### 4. 一个 API，接入多模态能力

统一调用图像生成、视频生成和具备决策能力的大模型，减少对接多个模型平台的开发与维护成本。

### 5. 内置企业团队，额度统一共享

支持团队成员协作使用、统一管理订阅额度，让模型资源在团队内灵活分配，使用情况更清晰。

### 6. 开源免费部署，支持 OEM 定制

支持自行部署，并可按企业需求定制品牌、界面与功能，快速搭建专属的 AI 网关服务。

## 开发说明

需求、代码、API、页面和公开文档的权威来源及变更流程见 [`docs/DEVELOPMENT-CONTRACT.md`](docs/DEVELOPMENT-CONTRACT.md)。每次改版先更新范围和验收，再实现代码，避免多份文档各自演进。

### 数据库结构变更

项目尚未上线。当前阶段直接修改 SQLite 表结构和初始化定义，不保留迁移脚本、版本兼容或旧数据库升级逻辑。正式上线后再建立并维护迁移流程。

### 视频任务运行方式

视频统一提交到 `POST /api/v1/videos`，必须携带 `Idempotency-Key`；结果通过 `GET /api/v1/tasks/{id}` 查询。启用的视频渠道在配置中声明模型、`videoSubmitPath` 和 `videoStatusPath`，默认分别为 `/videos` 与 `/videos/{id}`。

任务写入 SQLite 后由进程内 worker 每 5 秒轮询；服务重启会从 `video_tasks` 表恢复未完成任务。将 `CAPI_DB_PATH` 指向持久卷，生产环境不要使用 `:memory:`。

发布前至少验证：Responses 非流式和 SSE、视频重复提交、提交超时后的 `unknown` 状态、服务重启后的任务恢复，以及成功/失败后的余额与冻结流水。

### 评测模型运行方式

评测模型（如 `typesafe-ai/jev`）不是语言模型，`/api/v1/chat/completions` 会被上游拒绝。这类模型统一走 `POST /api/v1/evaluate`，请求体为 `{ model, state, questions }`，问题类型支持 `boolean`、`noul`、`choice`、`score`，密钥需要 `llm.evaluate` 权限。

渠道可用 `evaluatePath` 覆写上游路径，默认 `/evaluate`。渠道预设包含 Vercel AI Gateway TypeSafe（`https://ai-gateway.vercel.sh/typesafe/v1/systemone`）和 TypeSafe AI（`https://api.typesafe.ai/v1/systemone`）；后者自动把对外模型 `typesafe-ai/jev` 映射到 `jev-latest`，并把 `boolean`/概率字段适配为 TypeSafe 的 `noul`。计费沿用与 chat 相同的倍率，按上游返回的 `usage` 结算。
