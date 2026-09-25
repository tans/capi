import type { ChatRequestBody } from "./relay";
import { RelayError } from "./errors";

export type AnthropicRequestBody = {
  model?: unknown;
  messages?: unknown;
  system?: unknown;
  max_tokens?: unknown;
  stream?: unknown;
  [key: string]: unknown;
};

export function anthropicErrorResponse(error: unknown, requestId?: string): Response {
  const status = error instanceof RelayError ? error.statusCode : 500;
  const errorType = error instanceof RelayError
    ? (error.code === "invalid_api_key" ? "authentication_error" : error.code === "quota_exceeded" ? "rate_limit_error" : error.code === "invalid_request" ? "invalid_request_error" : "api_error")
    : "api_error";
  const message = error instanceof Error ? error.message : "internal error";
  return Response.json({ type: "error", error: { type: errorType, message: requestId ? `${message} (request id: ${requestId})` : message } }, { status });
}

export async function anthropicRelayResponse(response: Response): Promise<Response> {
  if (!response.headers.get("content-type")?.includes("application/json")) return response;
  const body = await response.json().catch(() => null) as { error?: { type?: unknown; message?: unknown } } | null;
  if (!body?.error || typeof body.error !== "object") return response;
  return Response.json({ type: "error", error: { type: typeof body.error.type === "string" ? body.error.type : "api_error", message: typeof body.error.message === "string" ? body.error.message : "Request failed." } }, { status: response.status, headers: { "cache-control": "no-store" } });
}

type AnthropicContentBlock = Record<string, unknown>;

function textFromBlock(value: unknown): string {
  if (typeof value === "string") return value;
  if (!Array.isArray(value)) return "";
  return value.flatMap((part) => {
    if (!part || typeof part !== "object") return [];
    const block = part as AnthropicContentBlock;
    return block.type === "text" && typeof block.text === "string" ? [block.text] : [];
  }).join("");
}

function sourceToUrl(source: unknown): string | null {
  if (!source || typeof source !== "object") return null;
  const value = source as AnthropicContentBlock;
  if (value.type === "url" && typeof value.url === "string") return value.url;
  if (value.type === "base64" && typeof value.data === "string") {
    const mediaType = typeof value.media_type === "string" ? value.media_type : "application/octet-stream";
    return `data:${mediaType};base64,${value.data}`;
  }
  return null;
}

function messageToOpenAI(message: AnthropicContentBlock): Record<string, unknown>[] {
  const role = typeof message.role === "string" ? message.role : "user";
  const content = message.content;
  if (typeof content === "string") return [{ role, content }];
  if (!Array.isArray(content)) return [{ role, content: "" }];

  const blocks = content.filter((part): part is AnthropicContentBlock => Boolean(part && typeof part === "object"));
  const toolResults = blocks.filter((part) => part.type === "tool_result");
  const regular = blocks.filter((part) => part.type !== "tool_result");
  const messages: Record<string, unknown>[] = [];

  if (role === "assistant") {
    const toolCalls = regular.filter((part) => part.type === "tool_use").map((part, index) => ({
      id: typeof part.id === "string" ? part.id : `tool_${index}`,
      type: "function",
      function: {
        name: typeof part.name === "string" ? part.name : "tool",
        arguments: JSON.stringify(part.input ?? {}),
      },
    }));
    const text = regular.filter((part) => part.type === "text").map((part) => typeof part.text === "string" ? part.text : "").join("");
    messages.push({ role, content: text || (toolCalls.length ? null : ""), ...(toolCalls.length ? { tool_calls: toolCalls } : {}) });
  } else {
    const parts: Record<string, unknown>[] = [];
    for (const part of regular) {
      if (part.type === "text" && typeof part.text === "string") parts.push({ type: "text", text: part.text });
      else if (part.type === "image") {
        const url = sourceToUrl(part.source);
        if (url) parts.push({ type: "image_url", image_url: { url } });
      } else if (typeof part.text === "string") parts.push({ type: "text", text: part.text });
    }
    if (parts.length > 0 || toolResults.length === 0) messages.push({ role, content: parts.length === 1 && parts[0].type === "text" ? parts[0].text : parts });
  }

  for (const part of toolResults) {
    const toolContent = textFromBlock(part.content) || (typeof part.content === "string" ? part.content : JSON.stringify(part.content ?? ""));
    messages.push({ role: "tool", tool_call_id: typeof part.tool_use_id === "string" ? part.tool_use_id : "", content: toolContent });
  }
  return messages;
}

function systemToMessage(system: unknown): Record<string, unknown> | null {
  const text = typeof system === "string" ? system : textFromBlock(system);
  return text ? { role: "system", content: text } : null;
}

function convertTools(tools: unknown): unknown {
  if (!Array.isArray(tools)) return tools;
  return tools.map((tool) => {
    if (!tool || typeof tool !== "object") return tool;
    const value = tool as AnthropicContentBlock;
    if (value.type === "function" && value.function) return value;
    return {
      type: "function",
      function: {
        name: typeof value.name === "string" ? value.name : "tool",
        description: typeof value.description === "string" ? value.description : undefined,
        parameters: value.input_schema && typeof value.input_schema === "object" ? value.input_schema : { type: "object", properties: {} },
      },
    };
  });
}

function convertToolChoice(choice: unknown): unknown {
  if (!choice || typeof choice !== "object") return choice;
  const value = choice as AnthropicContentBlock;
  if (value.type === "auto") return "auto";
  if (value.type === "none") return "none";
  if (value.type === "any") return { type: "required" };
  if (value.type === "tool" && typeof value.name === "string") return { type: "function", function: { name: value.name } };
  return value;
}

/** Convert the native Claude request into the internal OpenAI-compatible relay shape. */
export function anthropicToChat(body: AnthropicRequestBody): ChatRequestBody {
  const model = typeof body.model === "string" ? body.model : "";
  const messages = Array.isArray(body.messages)
    ? body.messages.flatMap((message) => message && typeof message === "object" ? messageToOpenAI(message as AnthropicContentBlock) : [])
    : [];
  const system = systemToMessage(body.system);
  const converted: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(body)) {
    if (!["model", "messages", "system", "max_tokens", "stream", "tools", "tool_choice", "stop_sequences"].includes(key)) converted[key] = value;
  }
  return {
    ...converted,
    model,
    messages: system ? [system, ...messages] : messages,
    ...(body.max_tokens !== undefined ? { max_tokens: body.max_tokens } : {}),
    ...(body.stream !== undefined ? { stream: body.stream } : {}),
    ...(body.tools !== undefined ? { tools: convertTools(body.tools) } : {}),
    ...(body.tool_choice !== undefined ? { tool_choice: convertToolChoice(body.tool_choice) } : {}),
    ...(body.stop_sequences !== undefined ? { stop: body.stop_sequences } : {}),
  } as ChatRequestBody;
}

function finishReason(value: unknown): string {
  if (value === "length") return "max_tokens";
  if (value === "tool_calls" || value === "function_call") return "tool_use";
  if (value === "stop" || value === "end_turn" || value === null || value === undefined) return "end_turn";
  return String(value);
}

function usageFromOpenAI(value: unknown): { input_tokens: number; output_tokens: number } {
  if (!value || typeof value !== "object") return { input_tokens: 0, output_tokens: 0 };
  const usage = value as AnthropicContentBlock;
  const input = typeof usage.prompt_tokens === "number" ? usage.prompt_tokens : usage.input_tokens;
  const output = typeof usage.completion_tokens === "number" ? usage.completion_tokens : usage.output_tokens;
  return { input_tokens: typeof input === "number" ? Math.max(0, input) : 0, output_tokens: typeof output === "number" ? Math.max(0, output) : 0 };
}

/** Convert an OpenAI-compatible response into Anthropic's message schema. */
export function chatToAnthropic(payload: Record<string, unknown>, request: AnthropicRequestBody, requestId: string): Record<string, unknown> {
  const choice = Array.isArray(payload.choices) && payload.choices[0] && typeof payload.choices[0] === "object" ? payload.choices[0] as AnthropicContentBlock : {};
  const message = choice.message && typeof choice.message === "object" ? choice.message as AnthropicContentBlock : choice;
  const content: Record<string, unknown>[] = [];
  if (typeof message.content === "string" && message.content) content.push({ type: "text", text: message.content });
  if (Array.isArray(message.content)) {
    for (const part of message.content) {
      if (part && typeof part === "object" && (part as AnthropicContentBlock).type === "text" && typeof (part as AnthropicContentBlock).text === "string") content.push({ type: "text", text: (part as AnthropicContentBlock).text });
    }
  }
  if (Array.isArray(message.tool_calls)) {
    for (const call of message.tool_calls) {
      if (!call || typeof call !== "object") continue;
      const value = call as AnthropicContentBlock;
      const fn = value.function && typeof value.function === "object" ? value.function as AnthropicContentBlock : {};
      let input: unknown = {};
      if (typeof fn.arguments === "string") {
        try { input = JSON.parse(fn.arguments); } catch { input = {}; }
      }
      content.push({ type: "tool_use", id: typeof value.id === "string" ? value.id : `tool_${content.length}`, name: typeof fn.name === "string" ? fn.name : "tool", input });
    }
  }
  const usage = usageFromOpenAI(payload.usage);
  return {
    id: typeof payload.id === "string" ? payload.id : `msg_${requestId}`,
    type: "message",
    role: "assistant",
    content,
    model: typeof request.model === "string" ? request.model : "",
    stop_reason: finishReason(choice.finish_reason),
    stop_sequence: null,
    usage,
  };
}

function eventBytes(event: string, data: Record<string, unknown>): Uint8Array {
  return new TextEncoder().encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

function consumeSse(buffer: string, onData: (data: string) => void): string {
  let rest = buffer;
  for (;;) {
    const separator = /\r?\n\r?\n/.exec(rest);
    if (!separator || separator.index === undefined) return rest;
    const event = rest.slice(0, separator.index);
    rest = rest.slice(separator.index + separator[0].length);
    const data = event.split(/\r?\n/).filter((line) => line.startsWith("data:")).map((line) => line.slice(5).replace(/^ /, "")).join("\n");
    if (data) onData(data);
  }
}

/** Convert OpenAI SSE deltas to the event stream consumed by Claude Code. */
export function chatStreamToAnthropic(response: Response, request: AnthropicRequestBody, requestId: string): Response {
  if (!response.body) return new Response(null, { status: response.status, headers: { "content-type": "text/event-stream; charset=utf-8" } });
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const model = typeof request.model === "string" ? request.model : "";
  let started = false;
  let closed = false;
  let buffer = "";
  let active: "text" | "thinking" | "tool" = "text";
  let activeIndex = 0;
  let nextIndex = 1;
  let finish: unknown = null;
  let inputTokens = 0;
  let outputTokens = 0;
  const toolBlocks = new Map<number, { index: number }>();

  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      const emit = (event: string, data: Record<string, unknown>) => controller.enqueue(eventBytes(event, data));
      const closeBlock = () => emit("content_block_stop", { type: "content_block_stop", index: activeIndex });
      const startBlock = (kind: "text" | "thinking" | "tool", block: Record<string, unknown>) => {
        active = kind;
        activeIndex = kind === "text" ? 0 : nextIndex++;
        emit("content_block_start", { type: "content_block_start", index: activeIndex, content_block: block });
      };
      if (!started) {
        started = true;
        emit("message_start", { type: "message_start", message: { id: `msg_${requestId}`, type: "message", role: "assistant", model, content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 0, output_tokens: 0 } } });
        startBlock("text", { type: "text", text: "" });
      }
      if (closed) { controller.close(); return; }
      try {
        const result = await reader.read();
        if (result.done) {
          buffer = consumeSse(buffer + decoder.decode(), (data) => {
            if (data !== "[DONE]") processData(data, emit, closeBlock, startBlock);
          });
          if (!closed) finishStream(controller, emit, closeBlock);
          return;
        }
        buffer = consumeSse(buffer + decoder.decode(result.value, { stream: true }), (data) => {
          if (data === "[DONE]") finishStream(controller, emit, closeBlock);
          else processData(data, emit, closeBlock, startBlock);
        });
      } catch (error) {
        controller.error(error);
      }
    },
    async cancel(reason) {
      await reader.cancel(reason);
    },
  });

  function processData(data: string, emit: (event: string, data: Record<string, unknown>) => void, closeBlock: () => void, startBlock: (kind: "text" | "thinking" | "tool", block: Record<string, unknown>) => void) {
    let parsed: AnthropicContentBlock;
    try { parsed = JSON.parse(data) as AnthropicContentBlock; } catch { return; }
    const choice = Array.isArray(parsed.choices) && parsed.choices[0] && typeof parsed.choices[0] === "object" ? parsed.choices[0] as AnthropicContentBlock : {};
    const delta = choice.delta && typeof choice.delta === "object" ? choice.delta as AnthropicContentBlock : {};
    const usage = usageFromOpenAI(parsed.usage);
    if (usage.input_tokens || usage.output_tokens) { inputTokens = usage.input_tokens; outputTokens = usage.output_tokens; }
    if (typeof delta.reasoning_content === "string") {
      if (active !== "thinking") { closeBlock(); startBlock("thinking", { type: "thinking", thinking: "" }); }
      emit("content_block_delta", { type: "content_block_delta", index: activeIndex, delta: { type: "thinking_delta", thinking: delta.reasoning_content } });
    }
    if (typeof delta.content === "string") {
      if (active !== "text") { closeBlock(); startBlock("text", { type: "text", text: "" }); }
      emit("content_block_delta", { type: "content_block_delta", index: activeIndex, delta: { type: "text_delta", text: delta.content } });
    }
    if (Array.isArray(delta.tool_calls)) {
      for (const raw of delta.tool_calls) {
        if (!raw || typeof raw !== "object") continue;
        const call = raw as AnthropicContentBlock;
        const index = typeof call.index === "number" ? call.index : 0;
        let block = toolBlocks.get(index);
        const fn = call.function && typeof call.function === "object" ? call.function as AnthropicContentBlock : {};
        if (!block) {
          if (active !== "tool") closeBlock();
          startBlock("tool", { type: "tool_use", id: typeof call.id === "string" ? call.id : `tool_${index}`, name: typeof fn.name === "string" ? fn.name : "tool", input: {} });
          block = { index: activeIndex };
          toolBlocks.set(index, block);
        } else if (activeIndex !== block.index) {
          if (active !== "tool") closeBlock();
          active = "tool";
          activeIndex = block.index;
        }
        if (typeof fn.arguments === "string" && fn.arguments) emit("content_block_delta", { type: "content_block_delta", index: block.index, delta: { type: "input_json_delta", partial_json: fn.arguments } });
      }
    }
    if (choice.finish_reason !== undefined && choice.finish_reason !== null) finish = choice.finish_reason;
  }

  function finishStream(controller: ReadableStreamDefaultController<Uint8Array>, emit: (event: string, data: Record<string, unknown>) => void, closeBlock: () => void) {
    if (closed) return;
    closed = true;
    closeBlock();
    emit("message_delta", { type: "message_delta", delta: { stop_reason: finishReason(finish), stop_sequence: null }, usage: { input_tokens: inputTokens, output_tokens: outputTokens } });
    emit("message_stop", { type: "message_stop" });
    controller.close();
  }

  return new Response(stream, { status: response.status, headers: { "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-cache, no-transform", connection: "keep-alive", "x-capi-request-id": requestId, ...(response.headers.get("x-capi-channel") ? { "x-capi-channel": response.headers.get("x-capi-channel")! } : {}) } });
}
