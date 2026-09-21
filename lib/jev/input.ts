function textFromContent(content: unknown): string[] {
  if (typeof content === "string") return [content];
  if (!Array.isArray(content)) return [];
  return content.flatMap((part) => {
    if (!part || typeof part !== "object") return [];
    const value = part as Record<string, unknown>;
    if ((value.type === "text" || value.type === "input_text") && typeof value.text === "string") return [value.text];
    return [];
  });
}

export function extractChatUserText(body: { messages?: { role?: string; content?: unknown }[] }): string {
  return (body.messages ?? [])
    .filter((message) => message.role === "user")
    .flatMap((message) => textFromContent(message.content))
    .join("\n");
}

export function extractResponsesUserText(input: unknown): string {
  if (typeof input === "string") return input;
  if (!Array.isArray(input)) return "";
  return input.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const value = item as Record<string, unknown>;
    if (value.role !== "user") return [];
    return textFromContent(value.content);
  }).join("\n");
}
