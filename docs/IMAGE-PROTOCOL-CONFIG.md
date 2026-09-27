# 渠道生图协议配置

渠道的 `imageProtocolConfig` 是版本化 JSON 配置，用来把 CAPI 的 OpenAI 图片请求映射到上游 JSON 生图 API。配置为空时，CAPI 使用 OpenAI Images 格式：`POST /images/generations`。

配置不执行代码。请求目标只能是渠道 `baseUrl` 下的相对路径，认证密钥由 CAPI 从当前渠道注入。

## 配置格式

```json
{
  "version": 1,
  "endpoint": "/images/generations",
  "auth": {
    "type": "bearer"
  },
  "request": {
    "model": { "from": "model" },
    "prompt": { "from": "prompt" },
    "image_size": { "from": "size", "default": "1024x1024" },
    "response_format": { "value": "url" }
  },
  "response": {
    "imagesPath": "data",
    "urlPath": "url",
    "base64Path": "b64_json",
    "revisedPromptPath": "revised_prompt"
  }
}
```

| Property | Meaning |
| --- | --- |
| `endpoint` | POST 路径，拼接在渠道 base URL 后。不能设置主机、查询参数或片段。 |
| `auth.type` | `bearer` 使用 `Authorization: Bearer <渠道密钥>`；`api-key-header` 把渠道密钥放进指定请求头。省略时使用 Bearer。 |
| `request` | 上游请求 JSON 的字段映射。目标字段支持 `input.prompt` 这样的点分嵌套路径。 |
| `request.<field>.from` | 从标准生图请求体读取同名字段，可映射 `model`、`prompt`、`size`、`quality`、`n`、`response_format`、`background`、`moderation`、`user` 或其他请求字段。 |
| `request.<field>.default` | 来源字段缺失或为 `null` 时使用的默认值。 |
| `request.<field>.map` | 按来源值做有限的枚举映射；未列出的值原样传递。 |
| `request.<field>.value` | 写入固定字符串、数字、布尔值或 `null`。 |
| `response.imagesPath` | 上游 JSON 中图片数组的位置。 |
| `response.urlPath` | 每个图片对象里的图片 URL 字段。 |
| `response.base64Path` | 每个图片对象里的 base64 字段，CAPI 对外命名为 `b64_json`。 |
| `response.revisedPromptPath` | 可选的修订提示词字段。 |

响应路径支持普通点分路径和 `$` 前缀，例如 `data.images`、`$.result.images`。数组下标可写作 `images.0.url`。每项至少要提取到 URL 或 base64 图片内容。

## 异步生图任务

部分服务商先返回任务 ID，再要求轮询任务状态。可选的 `task` 配置告诉 CAPI 如何提交、轮询并提取最终图片：

```json
{
  "version": 1,
  "endpoint": "/api/v1/images/generations",
  "auth": { "type": "bearer" },
  "request": {
    "model": { "from": "model" },
    "prompt": { "from": "prompt" },
    "size": { "from": "size", "default": "1:1", "map": { "1024x1024": "1:1", "1536x1024": "3:2", "1024x1536": "2:3" } },
    "resolution": { "value": "1K" },
    "n": { "from": "n", "default": 1 },
    "image_urls": { "from": "image_urls" }
  },
  "response": { "imagesPath": "data", "urlPath": "$" },
  "task": {
    "idPath": "data.0.task_id",
    "statusEndpoint": "/api/v1/tasks/{task_id}",
    "statusPath": "data.status",
    "resultImagesPath": "data.result.images",
    "completedStatus": "completed",
    "failedStatus": "failed",
    "pollIntervalMs": 1000
  }
}
```

`statusEndpoint` must stay on the channel base URL and contain exactly one `{task_id}` placeholder. Polling uses the channel's configured credentials and the same request timeout as the submission. CAPI returns an OpenAI-compatible completed image response after the task completes; the Responses API uses the same behavior.

### xiaoguai GPT-Image-2.5 1K

在渠道模型列表中添加 `gpt-image-2.5-1k`，渠道 base URL 填 `https://xiaoguai123.xyz`，并设置上方异步协议配置。该上游接受 `size` 比例、`resolution: "1K"`、`n` 和可选 `image_urls`；如果客户端会发送 OpenAI 像素尺寸，可在 `size.map` 中添加对应映射。模型文档：[GPT-Image-2.5 1K](https://xiaoguai123.xyz/docs/models/gpt-image-2.5-1k)。

## API 密钥请求头示例

如果服务商用 `X-API-Key` 认证：

```json
{
  "version": 1,
  "endpoint": "/v2/generate",
  "auth": { "type": "api-key-header", "header": "X-API-Key" },
  "request": {
    "model": { "from": "model" },
    "prompt": { "from": "prompt" }
  },
  "response": {
    "imagesPath": "result.images",
    "urlPath": "download_url"
  }
}
```

## Responses API

请求 `/responses` 并包含 `tools: [{"type":"image_generation"}]` 时，CAPI 使用同一渠道配置调用上游生图接口，然后把图片映射成 Responses 的 `image_generation_call` 输出。`stream: true` 时会输出对应的 Responses SSE 事件。渠道密钥需要包含 `image.generate` scope。

## 让 AI 生成配置

把服务商的生图请求示例、响应示例和渠道 base URL 提供给 AI，并要求它只输出符合本文件 `version: 1` 的 `imageProtocolConfig` JSON。将 JSON 粘贴到渠道编辑器的“生图协议配置”，保存后用一个低成本提示词实际请求验证。密钥只填在渠道凭证里，不要放进提示词或配置 JSON。
