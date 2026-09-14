<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## 数据库变更约束

项目上线前直接修改 SQLite 表结构和初始化定义，不实现迁移脚本、版本兼容或旧数据库升级逻辑。正式上线后由维护者移除此约束并建立迁移流程。

## 浏览器验收约束

需要登录态的页面验收必须通过 BrowserOS neo MCP（`http://127.0.0.1:9010/mcp`）的真实浏览器会话执行。不得使用 `curl`、直接 HTTP 请求或无会话浏览器来验证受保护页面；这些请求只会被登录拦截，不能证明页面功能或导航正确。
