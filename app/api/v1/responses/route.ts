import {
  authenticateKey,
  getRegistry,
  newRequestId,
  relayChatCompletion,
  relayErrorResponse,
  type ChatRequestBody,
} from "@/lib/relay";

type ResponsesInputItem = {
  role?: string;
  content?: string | { type?: string; text?: string }[];
};

type ResponsesRequestBody = {
  model?: string;
  input?: string | ResponsesInputItem[];
  stream?: boolean;
  max_output_tokens?: number;
  [key: string]: unknown;
};

/** OpenAI Responses-compatible facade over the relay's chat-completions path. */
export async function POST(request: Request) {
  const registry = await getRegistry();
  const auth = authenticateKey(registry, request, "llm.chat");
  if (!auth.ok) return auth.response;

  let body: ResponsesRequestBody;
  try {
    body = (await request.json()) as ResponsesRequestBody;
  } catch {
    return Response.json(
      { error: { type: "invalid_request_error", message: "Body must be JSON." } },
      { status: 400 },
    );
  }

  if (!body.model || typeof body.model !== "string") {
    return Response.json(
      { error: { type: "invalid_request_error", code: "invalid_model", message: "Missing required parameter: model." } },
      { status: 400 },
    );
  }
  if (body.stream === true) {
    return Response.json(
      { error: { type: "invalid_request_error", code: "unsupported_stream", message: "Responses streaming is not supported yet." } },
      { status: 400 },
    );
  }
  if (typeof body.input !== "string" && !Array.isArray(body.input)) {
    return Response.json(
      { error: { type: "invalid_request_error", code: "invalid_input", message: "`input` must be a string or an array." } },
      { status: 400 },
    );
  }

  const requestId = newRequestId();
  const chatBody: ChatRequestBody = {
    model: body.model,
    messages: toMessages(body.input),
    ...(typeof body.max_output_tokens === "number" ? { max_tokens: body.max_output_tokens } : {}),
  };

  try {
    const upstream = await relayChatCompletion({
      registry,
      apiKey: auth.apiKey,
      pinnedChannelId: auth.pinnedChannelId,
      requestId,
      body: chatBody,
    });
    if (!upstream.ok) return upstream;

    const chat = (await upstream.json()) as {
      id?: string;
      created?: number;
      model?: string;
      choices?: { message?: { content?: unknown }; finish_reason?: string }[];
      usage?: Record<string, unknown>;
      cost?: unknown;
    };
    const text = extractText(chat.choices?.[0]?.message?.content);
    const responseId = `resp_${crypto.randomUUID().replaceAll("-", "")}`;
    return Response.json(
      {
        id: responseId,
        object: "response",
        created_at: chat.created ?? Math.floor(Date.now() / 1000),
        status: "completed",
        model: chat.model ?? body.model,
        output: [
          {
            id: `msg_${crypto.randomUUID().replaceAll("-", "")}`,
            type: "message",
            status: "completed",
            role: "assistant",
            content: [{ type: "output_text", text, annotations: [] }],
          },
        ],
        output_text: text,
        ...(chat.usage ? { usage: chat.usage } : {}),
        ...(chat.cost !== undefined ? { cost: chat.cost } : {}),
      },
      {
        status: upstream.status,
        headers: {
          "x-capi-channel": upstream.headers.get("x-capi-channel") ?? "",
          "x-capi-request-id": requestId,
        },
      },
    );
  } catch (error) {
    console.error("[relay] responses failed:", error);
    return relayErrorResponse(error, requestId);
  }
}

export async function GET() {
  return Response.json(
    { error: { type: "invalid_request_error", code: "method_not_allowed", message: "Use POST for responses." } },
    { status: 405, headers: { allow: "POST" } },
  );
}

function toMessages(input: string | ResponsesInputItem[]) {
  if (typeof input === "string") return [{ role: "user", content: input }];
  return input.map((item) => ({
    role: item.role ?? "user",
    content: typeof item.content === "string"
      ? item.content
      : (item.content ?? []).filter((part) => part.type === "input_text").map((part) => part.text ?? "").join(""),
  }));
}

function extractText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content.map((part) => {
    if (typeof part === "string") return part;
    if (part && typeof part === "object" && "text" in part && typeof part.text === "string") return part.text;
    return "";
  }).join("");
}
