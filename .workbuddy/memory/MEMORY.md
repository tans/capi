# Capi 项目长期记忆

## 项目定位
capi = AI API 中转站产品站（Next.js 16 App Router + [locale] 中英双语 + Tailwind 4）。
`lib/relay/` 是中转核心（2026-09-12 落地），参考 New-API（QuantumNous/new-api）实现。

- 持久化要求：禁止演示代码、mock 数据和 localStorage 作为业务存储；正式数据统一使用 SQLite。开发、脚本和验证统一使用 Bun（优先 Bun 原生 SQLite 能力/兼容方案）。
## 中转模块约定（lib/relay/）
- 存储：SQLite 数据库（开发使用 Bun）；RelayRegistry 单例（globalThis）仅可作为连接/缓存层，不作为持久化真相；数据库迁移必须可重复执行。
- 核心语义（对齐 New-API）：
  - 渠道选择 = 优先级分层（retry 降级到第 N 优先级）+ 同层加权随机（全 0 权重等权、平均权重<10 放大 100 倍），见 selector.ts
  - quota 单位：1 USD = 500000；1 模型倍率单位 = $0.002/1K tokens
  - 重试区间：1xx/3xx/401-407/409-499/500-503/505-523/525-599；跳过 400/408/504/524
  - 自动禁用：上游 401 或错误关键词命中（settings.autoDisableKeywords），渠道 status=2
  - 密钥支持 `sk-<key>-<channelId>` 指定渠道；模型白名单支持 `prefix-*` 通配
- 环境变量：CAPI_ADMIN_TOKEN（管理接口，生产必填）、CAPI_RELAY_RETRY_TIMES、CAPI_RELAY_TIMEOUT_MS、CAPI_RELAY_DATA_FILE、CAPI_DB_PATH
- 管理接口：/api/admin/{channels,keys,abilities,overview}（abilities?group=&model= 看路由分层与权重占比）
- 不提供演示密钥、演示渠道或无渠道 mock 回退；缺少配置时必须返回明确错误。

## 遗留
- 上游统一按 OpenAI 兼容 /chat/completions + Bearer 转发；Anthropic/Gemini 原生协议未做转换
- auto 分组（autoGroups/crossGroupRetry）字段已留未实现；渠道/密钥管理 UI 未做
- 旧 mock：lib/mock-api.ts 仍服务 tasks/images/kling 路由
