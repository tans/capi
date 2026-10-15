# CAPI 项目备忘

## 部署

- 用 `bash scripts/deploy.sh minapp [--dry-run] [git-ref]`，从 origin/main 构建，先跑全量 `go test -tags webui_dist`，失败则不上线。
- 部署前确认本地 main 已同步 `origin/main`。
- minapp = token.minapp.xin（systemd，`/data/capi`，部署前自动 capi-admin backup）。capi.jisuhudong.com 已于 2026-10-15 下线，仅保留 nginx 配置与数据；不再部署。
- 上线后验证：`/api/healthz`、`/api/readyz` 200；脚本自带失败回滚。

## 已踩过的坑（勿重复处理）

- `internal/webui/handler_test.go` 的 teams 文案断言和 docs 页数（want=58 HTML / want=52 Markdown）必须与 `web/src/lib/i18n/dictionaries/*.ts` 和 `web/src/lib/api-spec.ts` 的实际内容保持一致。改营销文案或增删 API 端点时同步更新这个测试，否则部署构建会被卡。
- 删除 API 端点会使预渲染 docs 页数减 2（en+zh 各一页）、Markdown 导出减 2，记得同步 handler_test 的 want 数。

## 数据库 Schema（开发 vs 发布）

- **开发期不写 migration**：改结构去 `internal/store/schema.sql`（声明式单一事实来源），然后 `go run ./cmd/capi dev sync` 同步本地开发库（只做安全变更：建表/加可空或有默认值的列/建索引；拒绝破坏性漂移）。
- 本地开发库在 `data/dev/capi.sqlite`（独立于生产库），`capi dev reset` 重建并补 seed（model_groups default、app_settings），`capi dev snapshot/restore` 用 `data/backups/<stamp>/`。
- **发布时才生成 migration**：已发布功能的 schema 变更必须补一条 migration 到 `internal/store/migrations.go` **数组尾部（只追加，绝不在中间插入）**——中间插入会重排后续版本号，让已部署库静默跳过、新库报 duplicate column，见 commit `0cc0191` 修过的坑。
- `TestDeclarativeSchemaMatchesMigrations` 保证 schema.sql 与迁移结果一致：动 schema.sql 或迁移任一侧，测试即报漂移。
- 迁移中非 DDL 语句（默认数据 INSERT/UPDATE）不写进 schema.sql；dev 库的对应种子放在 `store.SeedDev`。
