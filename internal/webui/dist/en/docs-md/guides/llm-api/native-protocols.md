# Native protocols

CAPI keeps the client-facing protocol you choose at the edge and translates it to the selected upstream channel when the shared request and response surface is compatible. Pick the route that matches your SDK so headers, streaming events, tools, and error handling keep their native shape.

## OpenAI Chat Completions

Use the OpenAI SDK with the CAPI base URL and a workspace API key:

```bash
curl https://YOUR_CAPI_HOST/v1/chat/completions \
  -H "Authorization: Bearer YOUR_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"model":"YOUR_MODEL","messages":[{"role":"user","content":"Hello"}],"stream":false}'
```

The model must be enabled for the key's group. CAPI retries another eligible channel after an upstream failure and settles platform-channel usage against the workspace wallet.

## OpenAI Responses

Send Responses input to `/v1/responses`. CAPI preserves the Responses JSON shape when the upstream supports it; model-specific built-in tools and stateful features remain dependent on that upstream.

```bash
curl https://YOUR_CAPI_HOST/v1/responses \
  -H "Authorization: Bearer YOUR_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"model":"YOUR_MODEL","input":"Summarise this in one sentence"}'
```

## Anthropic Messages

Anthropic clients can use the native path and headers. CAPI accepts `x-api-key` as well as the bearer form, and returns Anthropic streaming events when `stream` is enabled.

```bash
curl https://YOUR_CAPI_HOST/v1/messages \
  -H "x-api-key: YOUR_API_TOKEN" \
  -H "anthropic-version: 2023-06-01" \
  -H "Content-Type: application/json" \
  -d '{"model":"YOUR_MODEL","max_tokens":256,"messages":[{"role":"user","content":"Hello"}]}'
```

## Gemini native

Gemini clients can call the native generate-content routes. The API key is still the CAPI workspace key; do not put an upstream provider key in the URL.

```bash
curl "https://YOUR_CAPI_HOST/v1beta/models/YOUR_MODEL:generateContent" \
  -H "Authorization: Bearer YOUR_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"contents":[{"role":"user","parts":[{"text":"Hello"}]}]}'
```

Use `:streamGenerateContent?alt=sse` for server-sent events. CAPI converts the native request to the configured channel protocol and converts the response back to Gemini format.

## Channel compatibility

Workspace administrators choose the upstream protocol in Channel settings. An OpenAI-compatible channel can serve the OpenAI and shared Anthropic/Gemini bridge where the configured model supports the translated fields. Native-only features are not silently emulated: an incompatible request fails with a clear upstream error.

ChatGPT subscriptions imported from the Codex CLI are a separate `codex/<model>` channel. Import the signed-in `auth.json` from the workspace Channels page; those requests use the ChatGPT Codex Responses backend and do not consume generic OpenAI API credits.
