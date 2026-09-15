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
