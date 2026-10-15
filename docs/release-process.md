# CAPI 版本升级流程

本文档描述从「代码就绪」到「线上运行新版本」的完整流程，供开发/运维参考。核心脚本：`scripts/release.sh`（打标签+发 GitHub Release）、`scripts/deploy.sh`（构建+部署+健康门控回滚）、`scripts/smoke.sh`（冒烟）。

## 总览

```
开发完成 → 更新 CHANGELOG → 提交推送到 main → release.sh 打标签
→ deploy.sh 构建&测试 → 部署 minapp → 验证 healthz/readyz/API → 记录
```

- **版本号**取自 `CHANGELOG.md` 顶部第一条 `## [x.y.z] - YYYY-MM-DD`。
- **部署目标**：`minapp` = `capi.minapp.xin`（systemd，`/data/capi`）。capi.jisuhudong.com 已于 2026-10-15 下线，仅保留 nginx 配置与数据。
- **迁移（migration）**：新版本若改了数据库结构，由部署启动时自动执行（`store.Migrate`），**不需要人工跑**。开发期的 schema 变更请走 `capi dev sync`（见 AGENTS.md「数据库 Schema」），发布时才把变更沉淀为 migrations.go **数组尾部新增**的 migration。

## 步骤 1：准备

1. 所有改动合入 `main` 并推送：
   ```bash
   git pull --rebase origin main   # 本地先同步
   git push origin main
   ```
2. 本地全量验证：
   ```bash
   go test -tags webui_dist ./...
   npx tsc --noEmit                 # web 类型
   npx vite build                   # web 构建（deploy 也会做）
   ```
3. 更新 `CHANGELOG.md`：在 `## [Unreleased]` 上插入
   ```markdown
   ## [x.y.z] - YYYY-MM-DD

   ### Added
   - ...

   ### Fixed
   - ...
   ```
   提交并推送该 changelog 提交（版本号以它为准）。

## 步骤 2：打标签并发布 Release

```bash
bash scripts/release.sh
```

脚本行为：取 CHANGELOG 顶部版本号 → 校验工作区干净、标签不存在 → `git tag -a vx.y.z` → 推送标签 → `gh release create` 发布 GitHub Release（notes 取自 changelog）。

- 失败场景：工作区有未提交改动、标签已存在、CHANGELOG 无 `x.y.z`。
- 版本号必须递增；同一个版本只允许发一次。

## 步骤 3：部署

```bash
# 先干跑（只构建测试，不碰服务器）
bash scripts/deploy.sh minapp --dry-run
bash scripts/deploy.sh both --dry-run

# 实际部署（默认 origin/main；也可指定 commit/分支）
bash scripts/deploy.sh both origin/main
```

脚本行为（两个目标一致）：

1. `git fetch` 并校验指定 ref 在 `origin/main` 历史中（`git merge-base --is-ancestor`），取 12 位 commit 作 release id。
2. 从该 commit `git archive` 出新目录，`npm ci` + `vite build`（webui_dist）+ `go vet` + 全量 `go test -tags webui_dist` —— **任一失败则不上线**。
3. 构建 Linux amd64 的 `capi` 与 `capi-admin`。
4. 部署：
   - **minapp**：上传二进制 → `capi-admin backup`（先备份，含数据库+files）→ 覆盖 `capi.env` → 写入 systemd drop-in 指向新二进制 → `systemctl daemon-reload && restart` → 轮询本地 `healthz/readyz` → 再对外网 `verify_public`（`/api/healthz /api/readyz /api/public/brand /api/public/models /docs`）。
5. **回滚**：任一健康检查失败，minapp 自动恢复上一个 drop-in 并重启。备份在 `/data/capi/data/backups/<stamp>/`（含 capi.sqlite + files + smtp.key）。手动恢复：停服后把备份目录里的 `capi.sqlite` 覆盖回 `data/capi.sqlite` 再启动（生产恢复只在紧急时人工操作，正常回滚交给脚本）。

## 步骤 4：上线后验证

```bash
# 两站健康
curl -fsS https://capi.minapp.xin/api/healthz
curl -fsS https://capi.minapp.xin/api/readyz
# 渠道/模型可见性
curl -s https://capi.minapp.xin/api/public/models | jq '.data | length'
# 平台渠道若含新渠道，应出现在列表

# 数据库迁移已生效
ssh token.minapp.xin "sqlite3 /data/capi/data/capi.sqlite 'SELECT MAX(version) FROM schema_migrations;'"
# 冒烟（本地跑即可，或对线上站跑）
bash scripts/smoke.sh https://capi.minapp.xin
```

针对新功能，最好再跑一次业务冒烟：如视频渠道，用一把带 `video.generate` 的 workspace key 提交一个低帧率任务，直到 `done` 且归档可下载。

## 步骤 5：收尾

- 记录：版本号、commit、两站部署时间、migration 后版本数、验证结果、是否回滚。
- 不需要清理旧 release 目录（deploy 保留多版本便于回滚）；磁盘吃紧时可手动清理 `data/backups`（按 retention 自动轮转）。

## 注意事项

- **必须**从干净、已推送的 main 出发；未推送的 commit 无法部署。
- 部署脚本会**拒绝**未在 `origin/main` 历史中的 ref。
- 版本号与 CHANGELOG 必须一致，否则 release.sh 报错。
- 迁移只追加、绝不插入中间（见 AGENTS.md，commit `0cc0191` 的教训）。
- 大版本/破坏性变更：先在本地/测试环境验证，再部署 minapp。
- 视频/图像渠道依赖上游（如 AC922），上游宕机时 deploy 本身不受影响，但渠道验证会失败——先确认上游可用再做业务冒烟。
