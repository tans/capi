import { estimateTokens } from "./pricing";
import type { ChatRequestBody, UpstreamUsage } from "./relay-contracts";

/** Parse only complete SSE events; an incomplete tail is returned untouched. */
export function consumeSseEvents(buffer: string, onData: (data: string) => void): string {
  let rest = buffer;
  for (;;) {
    const separator = /\r?\n\r?\n/.exec(rest);
    if (!separator || separator.index === undefined) return rest;
    const event = rest.slice(0, separator.index);
    rest = rest.slice(separator.index + separator[0].length);
    const data = event.split(/\r?\n/)
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).replace(/^ /, ""))
      .join("\n");
    if (data) onData(data);
  }
}

/** Normalize usage from Chat Completions or Responses payloads. */
export function extractUsage(payload: Record<string, unknown>): UpstreamUsage | null {
  const response = payload.response;
  const nested = response && typeof response === "object" ? (response as Record<string, unknown>).usage : undefined;
  const candidate = nested && typeof nested === "object" ? nested : payload.usage;
  if (!candidate || typeof candidate !== "object") return null;
  const usage = candidate as Record<string, unknown>;
  const promptTokens = typeof usage.prompt_tokens === "number" ? usage.prompt_tokens : usage.input_tokens;
  const completionTokens = typeof usage.completion_tokens === "number" ? usage.completion_tokens : usage.output_tokens;
  const promptDetails = usage.prompt_tokens_details;
  const inputDetails = usage.input_tokens_details;
  const details = promptDetails && typeof promptDetails === "object" ? promptDetails : inputDetails;
  const cachedTokens = details && typeof details === "object" && typeof (details as Record<string, unknown>).cached_tokens === "number"
    ? (details as Record<string, unknown>).cached_tokens as number
    : 0;
  if (typeof promptTokens !== "number" && typeof completionTokens !== "number" && cachedTokens === 0) return null;
  return {
    promptTokens: typeof promptTokens === "number" ? Math.max(0, promptTokens) : 0,
    completionTokens: typeof completionTokens === "number" ? Math.max(0, completionTokens) : 0,
    cachedTokens: Math.max(0, cachedTokens),
  };
}

/** 粗估 prompt token：把消息内容拼起来按 4 字符/token 估。 */
export function estimateResponsesPromptTokens(body: Record<string, unknown>): number {
  return estimateTokens(JSON.stringify(body.input ?? ""));
}

export function estimatePromptTokens(body: ChatRequestBody): number {
  if (!Array.isArray(body.messages)) return 0;
  let text = "";

  for (const message of body.messages) {
    const content = message.content;
    if (typeof content === "string") {
      text += content;
    } else if (Array.isArray(content)) {
      for (const part of content) {
        if (part && typeof part === "object" && "text" in part && typeof (part as { text?: unknown }).text === "string") {
          text += (part as { text: string }).text;
        }
      }
    }
  }
  return estimateTokens(text);
}

export function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}...` : text;
}
