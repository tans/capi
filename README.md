# CAPI

CAPI 是基于 Next.js、Bun 和 SQLite 的模型 API 中转与工作空间管理项目。

## 开发统一契约

需求、代码、API、页面和公开文档的权威来源及变更流程见 [`docs/DEVELOPMENT-CONTRACT.md`](docs/DEVELOPMENT-CONTRACT.md)。每次改版先更新范围和验收，再实现代码，避免多份文档各自演进。

## 开发

```bash
bun run dev
```

默认打开 [http://localhost:3210](http://localhost:3210)。常用检查命令：

```bash
bun run lint
bun test
```

## 数据库结构变更

项目尚未上线。当前阶段直接修改 SQLite 表结构和初始化定义，不保留迁移脚本、版本兼容或旧数据库升级逻辑。正式上线后再建立并维护迁移流程。
