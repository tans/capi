# CAPI 项目备忘

## 部署

- 用 `bash scripts/deploy.sh <minapp|jisuhudong|both> [--dry-run] [git-ref]`，从 origin/main 构建，先跑全量 `go test -tags webui_dist`，失败则不上线。
- 部署前确认本地 main 已同步 `origin/main`。
- minapp = token.minapp.xin（systemd，`/data/capi`，部署前自动 capi-admin backup）；jisuhudong = room.minapp.xin（Docker Compose，ops 仓库在 `/data/capi/ops`）。
- 上线后验证：`/api/healthz`、`/api/readyz` 200；脚本自带失败回滚。

## 已踩过的坑（勿重复处理）

- `internal/webui/handler_test.go` 的 teams 文案断言和 docs 页数（want=58 HTML / want=52 Markdown）必须与 `web/src/lib/i18n/dictionaries/*.ts` 和 `web/src/lib/api-spec.ts` 的实际内容保持一致。改营销文案或增删 API 端点时同步更新这个测试，否则部署构建会被卡。
- 删除 API 端点会使预渲染 docs 页数减 2（en+zh 各一页）、Markdown 导出减 2，记得同步 handler_test 的 want 数。
