# CAPI

CAPI 是基于 Next.js、Bun 和 SQLite 的模型 API 中转与工作空间管理项目。

## 开发统一契约

需求、代码、API、页面和公开文档的权威来源及变更流程见 [`docs/DEVELOPMENT-CONTRACT.md`](docs/DEVELOPMENT-CONTRACT.md)。每次改版先更新范围和验收，再实现代码，避免多份文档各自演进。

## 数据库结构变更

项目尚未上线。当前阶段直接修改 SQLite 表结构和初始化定义，不保留迁移脚本、版本兼容或旧数据库升级逻辑。正式上线后再建立并维护迁移流程。

## 视频任务运行方式

视频统一提交到 `POST /api/v1/videos`，必须携带 `Idempotency-Key`；结果通过 `GET /api/v1/tasks/{id}` 查询。启用的视频渠道在配置中声明模型、`videoSubmitPath` 和 `videoStatusPath`，默认分别为 `/videos` 与 `/videos/{id}`。

任务写入 SQLite 后由进程内 worker 每 5 秒轮询；服务重启会从 `video_tasks` 表恢复未完成任务。将 `CAPI_DB_PATH` 指向持久卷，生产环境不要使用 `:memory:`。

发布前至少验证：Responses 非流式和 SSE、视频重复提交、提交超时后的 `unknown` 状态、服务重启后的任务恢复，以及成功/失败后的余额与冻结流水。

## 快速 API 测试

`bun run test:smoke` 会读取仓库旁的 `../capi-test/.env`，用真实 API key 检查 models、chat 和 evaluate。默认目标是本地测试环境；正式环境使用 `--target prod`。密钥只放在 dotenv 文件中，不会打印或写入测试结果。

```dotenv
CAPI_TEST_API_KEY=capi_sk_test_...
CAPI_TEST_BASE_URL=http://localhost:3210/api/v1
CAPI_PROD_API_KEY=capi_sk_live_...
CAPI_PROD_BASE_URL=https://capi.minapp.xin/api/v1
CAPI_SMOKE_CHAT_MODEL=alibaba/qwen3.7-flash
CAPI_SMOKE_EVALUATE_MODEL=typesafe-ai/jev
```

```bash
bun run test:smoke -- --target test
bun run test:smoke -- --target prod --check-balance
```

也可以用 `--env-file`、`--base-url` 或 `--api-key` 临时覆盖配置。`/me/balance` 没有 `billing.read` 权限时会标记为跳过，不会把权限差异误报为服务故障。

## 评测模型运行方式

评测模型（如 `typesafe-ai/jev`）不是语言模型，`/api/v1/chat/completions` 会被上游拒绝。这类模型统一走 `POST /api/v1/evaluate`，请求体为 `{ model, state, questions }`，问题类型支持 `boolean`、`noul`、`choice`、`score`，密钥需要 `llm.evaluate` 权限。

渠道可用 `evaluatePath` 覆写上游路径，默认 `/evaluate`。渠道预设包含 Vercel AI Gateway TypeSafe（`https://ai-gateway.vercel.sh/typesafe/v1/systemone`）和 TypeSafe AI（`https://api.typesafe.ai/v1/systemone`）；后者自动把对外模型 `typesafe-ai/jev` 映射到 `jev-latest`，并把 `boolean`/概率字段适配为 TypeSafe 的 `noul`。计费沿用与 chat 相同的倍率，按上游返回的 `usage` 结算。
