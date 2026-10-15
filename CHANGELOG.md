# Changelog

All notable changes to CAPI are documented in this file. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow [Semantic Versioning](https://semver.org/).

To cut a release: add a `## [x.y.z] - YYYY-MM-DD` section here, commit to `main`, then run `bash scripts/release.sh` (tags `vx.y.z` and publishes the GitHub release).

## [Unreleased]

### Removed

- capi.jisuhudong.com 服务下线：Docker Compose 服务（`ops` 项目 / `capi-production` 容器）已从 room.minapp.xin 移除；nginx 配置、数据库与备份保留在服务器上。`scripts/deploy.sh` 仅支持 `minapp` 目标。

## [0.2.0] - 2026-10-15

### Added

- AC922 第三方生成服务支持：图像渠道（OpenAI 协议，qwen-image-2.1）与视频渠道（异步 REST，minimax-h3，二进制结果轮询与归档）
- 工作区管理 API 与多媒体控制台界面（文件浏览、视频生成、任务状态）
- 声明式 schema.sql 作为统一 schema 唯一事实来源，配合开发期 Schema Sync（`capi dev sync/snapshot/restore/reset`），生产仍走 migrations.go 升级（见 docs/release-process.md）
- 视频协议扩展：二进制结果（`resultEndpoint`）支持，产物直接归档
- Admin 渠道测试对话框：按渠道+模型向上游发送探测请求
- 版本升级流程文档（docs/release-process.md）

### Changed

- 官网首页重写：网关能力矩阵 + 部署 FAQ + 新版 hero/展示区域
- 工作区导航扁平化：模型测评并入渠道页、计费入口更名、移除 usage-analytics 导航项
- 渠道编辑器领域规则提取到 internal/channel 包；relay 重试循环收敛为单一引擎（relay_engine.go）
- daisyUI → shadcn 组件迁移完成；多媒体页面样式还原
- prompt 历史更名为 prompt 管理

### Fixed

- 渠道编辑白屏：list API 返回 `keyCount` 而非 `keys`，编辑器打开不再抛异常
- 部署脚本用 CHANGELOG 版本字符串（含括号）命名临时文件/release 目录/Docker tag；改为 12 位 commit，版本仅展示用
- migration 数组尾部重复添加 `video_tasks.prompt/reference_file_ids`（插入中间会重排版本号，导致新库 duplicate column）；已移除中间插入，保留尾部追加
- 上游视频下载后 body 在归档阶段丢失（context cancel 过早触发）；改为依赖 client timeout

## [0.1.0] - 2026-10-11

### Added

- Unified AI gateway API for LLM, image, and video models with a single workspace key
- Workspace and member management with roles, invites, and per-key budgets
- Channel routing with upstream provider configuration, model discovery, and health checks
- Usage metering and billing with per-model rates and redeemable credit codes
- Prompt redaction engine (脱敏审核) with per-workspace toggle
- Task API for long-running video generation jobs
- Admin console: pricing, users, announcements, email settings, model evaluation
- Marketing site and documentation with prerendered en/zh pages and Markdown exports
- Automated deploy pipeline with health-gated rollout and rollback (`scripts/deploy.sh`)
