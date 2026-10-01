---
title: 原生协议
description: 使用 OpenAI、Anthropic 和 Gemini 的原生请求格式调用 CAPI。
---

CAPI 在边缘保留你选择的客户端协议，并在请求和响应兼容时转换到选中的上游渠道。根据 SDK 选择对应路径，保留原生请求头、流式事件、工具调用和错误处理。

## OpenAI Chat Completions

使用 OpenAI SDK 和 CAPI 基础地址及工作区 API Key：

```bash
curl https://YOUR_CAPI_HOST/v1/chat/completions \
  -H "Authorization: Bearer YOUR_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"model":"YOUR_MODEL","messages":[{"role":"user","content":"你好"}],"stream":false}'
```

模型必须对密钥所属分组开放。上游失败时，CAPI 会尝试其他符合条件的渠道，并将平台渠道用量结算到工作区余额。

## OpenAI Responses

向 `/v1/responses` 发送 Responses 请求。上游支持时，CAPI 保留 Responses 的 JSON 结构；内置工具等模型特性仍取决于上游。

```bash
curl https://YOUR_CAPI_HOST/v1/responses \
  -H "Authorization: Bearer YOUR_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"model":"YOUR_MODEL","input":"用一句话总结这段内容"}'
```

## Anthropic Messages

Anthropic 客户端可以使用原生路径和请求头。CAPI 接受 `x-api-key` 或 bearer 形式的密钥，启用 `stream` 时返回 Anthropic 流式事件。

```bash
curl https://YOUR_CAPI_HOST/v1/messages \
  -H "x-api-key: YOUR_API_TOKEN" \
  -H "anthropic-version: 2023-06-01" \
  -H "Content-Type: application/json" \
  -d '{"model":"YOUR_MODEL","max_tokens":256,"messages":[{"role":"user","content":"你好"}]}'
```

## Gemini 原生接口

Gemini 客户端可以调用原生生成内容路径。URL 中仍使用 CAPI 工作区 API Key，不要放入上游提供商密钥。

```bash
curl "https://YOUR_CAPI_HOST/v1beta/models/YOUR_MODEL:generateContent" \
  -H "Authorization: Bearer YOUR_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"contents":[{"role":"user","parts":[{"text":"你好"}]}]}'
```

流式请求使用 `:streamGenerateContent?alt=sse`。CAPI 会将原生请求转换为配置的渠道协议，再把响应转换回 Gemini 格式。

## 渠道兼容性

工作区管理员在渠道设置中选择上游协议。配置为 OpenAI 兼容协议的渠道，可以在模型支持时参与 Anthropic/Gemini 的共享转换。原生专属能力不会被静默模拟，不兼容的请求会返回清晰的上游错误。

从 Codex CLI 导入的 ChatGPT 订阅是独立的 `codex/<model>` 渠道。请在工作区渠道页面导入已登录的 `auth.json`；请求会使用 ChatGPT Codex Responses 后端，不消耗普通 OpenAI API 额度。
