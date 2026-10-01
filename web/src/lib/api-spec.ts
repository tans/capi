/**
 * Structured API reference.
 *
 * The reference is data-driven rather than hand-written MDX: every endpoint
 * shares the same shape (method, path, parameters, runnable example, response),
 * so one renderer covers the whole surface and the sidebar can be derived.
 */

export type ApiParam = {
  name: string;
  type: string;
  required?: boolean;
  description: string;
};

export type ApiEndpoint = {
  /** URL segment under /docs/api, e.g. "kling/text-to-video". */
  slug: string;
  group: string;
  provider: string;
  title: string;
  method: "GET" | "POST";
  path: string;
  summary: string;
  overview: string;
  /** Async Task API endpoints return a task id rather than the media itself. */
  async?: boolean;
  params: ApiParam[];
  requestBody?: string;
  responseBody: string;
  responseStatus: { code: string; text: string };
  example: { label: string; language: string; code: string }[];
  notes?: string[];
};

const TOKEN = "YOUR_API_TOKEN";

function curlPost(path: string, body: string) {
  return `curl -X POST https://YOUR_CAPI_HOST${path} \\
  -H "Authorization: Bearer ${TOKEN}" \\
  -H "Content-Type: application/json" \\
  -d '${body}'`;
}

function curlGet(path: string) {
  return `curl https://YOUR_CAPI_HOST${path} \\
  -H "Authorization: Bearer ${TOKEN}"`;
}


/* -------------------------------------------------------------------------- */

export const apiEndpoints: ApiEndpoint[] = [
  {
    slug: "videos",
    group: "Task API",
    provider: "Configured video provider",
    title: "Video Generation",
    method: "POST",
    path: "/v1/videos",
    summary: "Submit an asynchronous video generation task.",
    overview:
      "The model selects an enabled video model. Provider-specific paths and credentials are configured on the channel, not exposed to API clients.",
    async: true,
    params: [
      { name: "model", type: "string", required: true, description: "An enabled video model ID." },
      { name: "prompt", type: "string", required: true, description: "Text description of the video." },
    ],
    requestBody: `{
  "model": "YOUR_VIDEO_MODEL",
  "prompt": "A paper kite flying above a quiet coastal town at sunrise"
}`,
    responseStatus: { code: "202", text: "Accepted" },
    responseBody: `{
  "id": "video_42_demo-video-001",
  "object": "video.task",
  "status": "running"
}`,
    example: [
      {
        label: "cURL",
        language: "bash",
        code: curlPost(
          "/v1/videos",
          `{"model":"YOUR_VIDEO_MODEL","prompt":"A paper kite above a coastal town at sunrise"}`,
        ),
      },
    ],
    notes: [
      "Submission returns 202 with a CAPI task ID. An optional Idempotency-Key (up to 200 characters) makes retries with the same API key and request body return the original task; reusing the key with a different body returns 409.",
      "Task statuses are submitting, running, unknown, succeeded, and failed.",
      "Status and result fields follow the configured provider. Poll the task ID returned by CAPI, not the upstream task ID.",
    ],
  },
  {
    slug: "gpt-image-2/text-to-image",
    group: "Image API",
    provider: "GPT Image 2",
    title: "GPT Image 2 Text-to-Image",
    method: "POST",
    path: "/v1/images/generations",
    summary: "Generate an image from a prompt.",
    overview:
      "GPT Image 2 adds sharper text rendering and layout control compared with the first generation, and follows long instructions closely.",
    params: [
      { name: "model", type: "string", required: true, description: "Model ID, e.g. gpt-image-2-text-to-image." },
      { name: "prompt", type: "string", required: true, description: "Image description." },
      { name: "size", type: "string", description: 'One of "1024x1024", "1536x1024", "1024x1536".' },
      { name: "quality", type: "string", description: 'One of "low", "medium", "high".' },
      { name: "n", type: "integer", description: "Number of images to return. Default 1." },
    ],
    requestBody: `{
  "model": "gpt-image-2-text-to-image",
  "prompt": "a minimal poster for a night train, deep blue background",
  "size": "1024x1024",
  "quality": "high"
}`,
    responseStatus: { code: "200", text: "OK" },
    responseBody: `{
  "data": [
    { "url": "https://file.capi.minapp.xin/images/out-1.png" }
  ]
}`,
    example: [
      {
        label: "cURL",
        language: "bash",
        code: curlPost(
          "/v1/images/generations",
          `{
    "model": "gpt-image-2-text-to-image",
    "prompt": "a minimal poster for a night train"
  }`,
        ),
      },
    ],
  },
  {
    slug: "gpt-image-2/edit-image",
    group: "Image API",
    provider: "GPT Image 2",
    title: "GPT Image 2 Edit Image",
    method: "POST",
    path: "/v1/images/edits",
    summary: "Edit an image with an instruction.",
    overview:
      "Edit applies a natural-language instruction to an existing image, optionally guided by a mask, and preserves the untouched regions.",
    params: [
      { name: "model", type: "string", required: true, description: "Model ID, e.g. gpt-image-2.5-edit-image." },
      { name: "image_url", type: "string", required: true, description: "Image to edit." },
      { name: "prompt", type: "string", required: true, description: "Instruction describing the change." },
      { name: "mask_url", type: "string", description: "Optional mask restricting the edit area." },
    ],
    requestBody: `{
  "model": "gpt-image-2.5-edit-image",
  "image_url": "https://file.capi.minapp.xin/images/out-1.png",
  "prompt": "swap the background to a snowy street",
  "mask_url": "https://file.capi.minapp.xin/masks/bg.png"
}`,
    responseStatus: { code: "200", text: "OK" },
    responseBody: `{
  "data": [
    { "url": "https://file.capi.minapp.xin/images/edited-1.png" }
  ]
}`,
    example: [
      {
        label: "cURL",
        language: "bash",
        code: curlPost(
          "/v1/images/edits",
          `{
    "model": "gpt-image-2.5-edit-image",
    "image_url": "https://file.capi.minapp.xin/images/out-1.png",
    "prompt": "swap the background to a snowy street"
  }`,
        ),
      },
    ],
  },
  {
    slug: "openai/chat-completions",
    group: "LLM API",
    provider: "OpenAI",
    title: "Chat Completions",
    method: "POST",
    path: "/v1/chat/completions",
    summary: "OpenAI-compatible chat completions.",
    overview:
      "Send OpenAI-compatible chat-completions requests through a configured OpenAI-compatible upstream. Streaming is supported when the upstream supports it.",
    params: [
      { name: "model", type: "string", required: true, description: "Model ID, e.g. gpt-5.6 or claude-opus-5." },
      { name: "messages", type: "array", required: true, description: "Conversation history in OpenAI message format." },
      { name: "stream", type: "boolean", description: "Stream tokens as server-sent events." },
      { name: "temperature", type: "number", description: "Sampling temperature between 0 and 2." },
      { name: "tools", type: "array", description: "Tool definitions the model may call." },
    ],
    requestBody: `{
  "model": "gpt-5.6",
  "messages": [
    { "role": "user", "content": "Summarise this changelog in three bullets." }
  ],
  "stream": false
}`,
    responseStatus: { code: "200", text: "OK" },
    responseBody: `{
  "id": "chatcmpl_9f2b41",
  "object": "chat.completion",
  "model": "gpt-5.6",
  "choices": [
    {
      "index": 0,
      "message": { "role": "assistant", "content": "..." },
      "finish_reason": "stop"
    }
  ],
  "usage": { "prompt_tokens": 42, "completion_tokens": 118, "total_tokens": 160 }
}`,
    example: [
      {
        label: "cURL",
        language: "bash",
        code: curlPost(
          "/v1/chat/completions",
          `{
    "model": "gpt-5.6",
    "messages": [{"role": "user", "content": "Hello"}]
  }`,
        ),
      },
      {
        label: "Python",
        language: "python",
        code: `from openai import OpenAI

# Only the base URL and key change.
client = OpenAI(
    base_url="https://YOUR_CAPI_HOST/v1",
    api_key="YOUR_API_TOKEN",
)

response = client.chat.completions.create(
    model="gpt-5.6",
    messages=[{"role": "user", "content": "Hello"}],
)

print(response.choices[0].message.content)`,
      },
      {
        label: "Node.js",
        language: "javascript",
        code: `import OpenAI from "openai";

const client = new OpenAI({
  baseURL: "https://YOUR_CAPI_HOST/v1",
  apiKey: process.env.CAPI_API_KEY,
});

const response = await client.chat.completions.create({
  model: "gpt-5.6",
  messages: [{ role: "user", content: "Hello" }],
});

console.log(response.choices[0].message.content);`,
      },
    ],
  },
  {
    slug: "evaluation",
    group: "LLM API",
    provider: "Configured evaluation model",
    title: "Evaluate",
    method: "POST",
    path: "/v1/evaluate",
    summary: "Typed decisions from an evaluation model.",
    overview:
      "Evaluation models return choices, scores, and boolean probabilities instead of generated text. Send the shared `state` plus a map of typed `questions`; every question is evaluated independently and returned under its own id. Question types are boolean, noul, choice, or score. The upstream path and protocol are configured on the channel, so both Vercel AI Gateway TypeSafe and TypeSafe AI Jev channels work.",
    params: [
      { name: "model", type: "string", required: true, description: "An enabled evaluation model ID, e.g. typesafe-ai/jev." },
      { name: "state", type: "string | object | array", required: true, description: "The shared input every question is evaluated against." },
      { name: "questions", type: "object", required: true, description: "Map of question id to a question of type boolean, noul, choice, or score. Up to 20 per request." },
    ],
    requestBody: `{
  "model": "typesafe-ai/jev",
  "state": "I was charged twice for my subscription this month.",
  "questions": {
    "refund": { "type": "boolean", "instructions": "Is the customer asking for money back?" },
    "urgency": {
      "type": "score",
      "instructions": "How urgent is this ticket?",
      "criteria": ["Low, no impact", "Medium, degraded experience", "High, blocking with financial loss"]
    }
  }
}`,
    responseStatus: { code: "200", text: "OK" },
    responseBody: `{
  "model": "typesafe-ai/jev",
  "answers": {
    "refund": { "type": "boolean", "probability": 0.98 },
    "urgency": { "type": "score", "score": 2.1, "probabilities": { "0": 0.05, "1": 0.2, "2": 0.75 } }
  }
}
`,
    example: [
      {
        label: "cURL",
        language: "bash",
        code: curlPost("/v1/evaluate", `{"model":"typesafe-ai/jev","state":"Review this request","questions":{"safe":{"type":"boolean","instructions":"Is this safe?"}}}`),
      },
    ],
  },
  {
    slug: "systemone",
    group: "LLM API",
    provider: "TypeSafe AI",
    title: "System One",
    method: "POST",
    path: "/v1/systemone",
    summary: "Evaluate typed questions with a System One model.",
    overview:
      "TypeSafe System One-compatible endpoint. Provide a state and one or more independent typed questions; CAPI routes the request through the workspace's configured evaluation channel, applies the same key scope and billing as /evaluate, and returns the configured evaluation provider’s typed answers.",
    params: [
      { name: "model", type: "string", required: true, description: "An enabled evaluation model ID, e.g. typesafe-ai/jev." },
      { name: "state", type: "string | object | array", required: true, description: "Text or structured JSON state to evaluate." },
      { name: "questions", type: "object", required: true, description: "Map of question IDs to questions of type noul, choice, or score. Up to 20 questions per request." },
    ],
    requestBody: `{
  "model": "typesafe-ai/jev",
  "state": { "message": "I was charged twice for my subscription." },
  "questions": {
    "refund_requested": {
      "type": "noul",
      "instructions": "Does the customer ask for a refund?"
    },
    "urgency": {
      "type": "choice",
      "instructions": "How urgent is the issue?",
      "criteria": {
        "low": "No immediate impact",
        "high": "Blocking with financial loss"
      }
    }
  }
}`,
    responseStatus: { code: "200", text: "OK" },
    responseBody: `{
  "model": "typesafe-ai/jev",
  "answers": {
    "refund_requested": { "type": "noul", "noul": 0.97 },
    "urgency": {
      "type": "choice",
      "choice": "high",
      "probabilities": { "low": 0.08, "high": 0.92 },
      "confidence": 0.84
    }
  }
}
`,
    example: [
      {
        label: "cURL",
        language: "bash",
        code: curlPost("/v1/systemone", `{"model":"typesafe-ai/jev","state":{"message":"Review this request"},"questions":{"decision":{"type":"noul","instructions":"Should this proceed?"}}}`),
      },
    ],
  },
  {
    slug: "openai/responses",
    group: "LLM API",
    provider: "OpenAI",
    title: "Responses",
    method: "POST",
    path: "/v1/responses",
    summary: "OpenAI Responses-compatible requests.",
    overview:
      "Forwards the Responses request schema to the configured upstream and returns its response or streaming events. Input items, built-in tools, and stateful features depend on upstream support.",
    params: [
      { name: "model", type: "string", required: true, description: "Model ID that supports the Responses API." },
      { name: "input", type: "string | array", required: true, description: "Prompt text or structured Responses input items supported by the selected upstream." },
      { name: "stream", type: "boolean", description: "Stream incremental output events." },
    ],
    requestBody: `{
  "model": "gpt-5.6-sol",
  "input": "Draft a migration plan for a Postgres schema change."
}`,
    responseStatus: { code: "200", text: "OK" },
    responseBody: `{
  "id": "resp_5c81a2",
  "object": "response",
  "model": "gpt-5.6-sol",
  "output": [
    { "type": "message", "role": "assistant", "content": [] }
  ],
  "usage": { "input_tokens": 24, "output_tokens": 402 }
}`,
    example: [
      {
        label: "cURL",
        language: "bash",
        code: curlPost(
          "/v1/responses",
          `{
    "model": "gpt-5.6-sol",
    "input": "Draft a migration plan"
  }`,
        ),
      },
    ],
  },
  {
    slug: "anthropic/messages",
    group: "LLM API",
    provider: "Anthropic",
    title: "Anthropic Messages",
    method: "POST",
    path: "/v1/messages",
    summary: "Anthropic Messages API surface.",
    overview:
      "Accepts Anthropic Messages requests and translates them through CAPI's shared chat relay. Existing clients can use the Anthropic request shape; tool use, image input, streaming, and other model-specific features depend on the configured upstream. Anthropic-only features are not guaranteed to map to every OpenAI-compatible channel.",
    params: [
      { name: "model", type: "string", required: true, description: "Claude model ID." },
      { name: "messages", type: "array", required: true, description: "Messages in Anthropic format." },
      { name: "max_tokens", type: "integer", required: true, description: "Upper bound on generated tokens." },
      { name: "system", type: "string | content blocks", description: "System prompt in Anthropic format." },
    ],
    requestBody: `{
  "model": "claude-opus-5",
  "max_tokens": 1024,
  "messages": [
    { "role": "user", "content": "Explain the CAP theorem." }
  ]
}`,
    responseStatus: { code: "200", text: "OK" },
    responseBody: `{
  "id": "msg_7c41ab",
  "type": "message",
  "role": "assistant",
  "content": [{ "type": "text", "text": "..." }],
  "stop_reason": "end_turn",
  "usage": { "input_tokens": 18, "output_tokens": 240 }
}`,
    example: [
      {
        label: "cURL",
        language: "bash",
        code: `curl -X POST https://YOUR_CAPI_HOST/v1/messages \\
  -H "x-api-key: ${TOKEN}" \\
  -H "anthropic-version: 2023-06-01" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "claude-opus-5",
    "max_tokens": 1024,
    "messages": [{"role": "user", "content": "Hello"}]
  }'`,
      },
    ],
  },
  {
    slug: "me/balance",
    group: "Platform",
    provider: "Account",
    title: "Get Balance",
    method: "GET",
    path: "/v1/me/balance",
    summary: "Return the API key workspace's available credit balance.",
    overview:
      "Returns the available and reserved balance of the workspace that owns the API key, in USD.",
    params: [],
    responseStatus: { code: "200", text: "OK" },
    responseBody: `{
  "balance": { "micros": 128440000, "amount": 128.44, "currency": "USD",
    "reserved_micros": 610000, "available_micros": 127830000 }
}`,
    example: [
      {
        label: "cURL",
        language: "bash",
        code: curlGet("/v1/me/balance"),
      },
    ],
  },
  {
    slug: "models/list",
    group: "Platform",
    provider: "Account",
    title: "List Models",
    method: "GET",
    path: "/v1/models",
    summary: "List every model available to the key.",
    overview:
      "Returns the model IDs exposed by enabled channels available to the calling workspace. Model restrictions still apply when a request is routed. This endpoint does not supply catalog pricing or modality filters.",
    params: [],
    responseStatus: { code: "200", text: "OK" },
    responseBody: `{"object":"list","data":[{"id":"YOUR_MODEL","object":"model","owned_by":"capi"}]}`,
    example: [
      {
        label: "cURL",
        language: "bash",
        code: curlGet("/v1/models"),
      },
    ],
  },
  {
    slug: "tasks/get",
    group: "Platform",
    provider: "Task",
    title: "Retrieve Task",
    method: "GET",
    path: "/v1/tasks/{task_id}",
    summary: "Poll the state of an async task.",
    overview:
      "Poll the video task created by POST /v1/videos. This deployment does not currently send task callbacks.",
    params: [
      { name: "task_id", type: "string", required: true, description: "Task identifier returned at creation, in the path." },
    ],
    responseStatus: { code: "200", text: "OK" },
    responseBody: `{
  "id": "video_42_demo-video-001",
  "object": "video.task",
  "status": "succeeded",
  "model": "YOUR_VIDEO_MODEL",
  "result": { "id": "upstream_task_id", "status": "succeeded", "url": "https://provider.example/result.mp4" },
  "updated_at": "2026-10-01T00:00:00Z"
}`,
    example: [
      {
        label: "cURL",
        language: "bash",
        code: curlGet("/v1/tasks/video_42_demo-video-001"),
      },
    ],
  },
];

export const apiEndpointMap = new Map(
  apiEndpoints.map((endpoint) => [endpoint.slug, endpoint]),
);

export function getEndpoint(slug: string) {
  return apiEndpointMap.get(slug);
}

export function endpointMarkdown(endpoint: ApiEndpoint) {
  const parameters = endpoint.params.length ? `## Parameters\n\n| Name | Type | Required | Description |\n| --- | --- | --- | --- |\n${endpoint.params.map(p => `| ${p.name} | ${p.type.replaceAll("|", "\\|")} | ${p.required ? "Yes" : "No"} | ${p.description.replaceAll("|", "\\|")} |`).join("\n")}\n\n` : "";
  return `# ${endpoint.title}\n\n${endpoint.summary}\n\n\`${endpoint.method} ${endpoint.path}\`\n\n## Overview\n\n${endpoint.overview}\n\n${parameters}${endpoint.requestBody ? `## Request body\n\n\`\`\`json\n${endpoint.requestBody}\n\`\`\`\n\n` : ""}## Examples\n\n${endpoint.example.map(e => `### ${e.label}\n\n\`\`\`${e.language}\n${e.code}\n\`\`\``).join("\n\n")}\n\n## Response\n\n${endpoint.responseStatus.code} ${endpoint.responseStatus.text}\n\n\`\`\`json\n${endpoint.responseBody}\n\`\`\`\n${endpoint.notes?.length ? `\n## Notes\n\n${endpoint.notes.map(n => `- ${n}`).join("\n")}\n` : ""}`;
}

export type ApiGroup = {
  group: string;
  providers: { provider: string; endpoints: ApiEndpoint[] }[];
};

/** Sidebar-shaped view of the reference: group → provider → endpoints. */
export const apiNav: ApiGroup[] = Array.from(
  apiEndpoints.reduce((groups, endpoint) => {
    const byProvider =
      groups.get(endpoint.group) ??
      new Map<string, ApiEndpoint[]>();
    const list = byProvider.get(endpoint.provider) ?? [];
    list.push(endpoint);
    byProvider.set(endpoint.provider, list);
    groups.set(endpoint.group, byProvider);
    return groups;
  }, new Map<string, Map<string, ApiEndpoint[]>>()),
).map(([group, byProvider]) => ({
  group,
  providers: Array.from(byProvider).map(([provider, endpoints]) => ({
    provider,
    endpoints,
  })),
}));
