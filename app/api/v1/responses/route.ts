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
    stream: body.stream === true,
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
    if (body.stream === true) return responsesStream(upstream, body.model, requestId);

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

function responsesStream(upstream: Response, model: string, requestId: string): Response {
  if (!upstream.body) return Response.json({ error: { type: "upstream_error", message: "Empty upstream stream." } }, { status: 502 });
  const responseId = `resp_${crypto.randomUUID().replaceAll("-", "")}`;
  const messageId = `msg_${crypto.randomUUID().replaceAll("-", "")}`;
  const encoder = new TextEncoder();
  const sse = (name: string, data: unknown) => encoder.encode(`event: ${name}\ndata: ${JSON.stringify(data)}\n\n`);
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let buffer = "";
      let usage: unknown;
      let text = "";
      const created = Math.floor(Date.now() / 1000);
      try {
        controller.enqueue(sse("response.created", { type: "response.created", response: { id: responseId, object: "response", created_at: created, status: "in_progress", model, output: [] } }));
        controller.enqueue(sse("response.output_item.added", { type: "response.output_item.added", output_index: 0, item: { id: messageId, type: "message", status: "in_progress", role: "assistant", content: [] } }));
        controller.enqueue(sse("response.content_part.added", { type: "response.content_part.added", item_id: messageId, output_index: 0, content_index: 0, part: { type: "output_text", text: "", annotations: [] } }));
        const reader = upstream.body!.getReader();
        for (;;) {
          const next = await reader.read();
          if (next.done) break;
          buffer += new TextDecoder().decode(next.value, { stream: true });
          const records = buffer.split("\n\n"); buffer = records.pop() ?? "";
          for (const record of records) {
            const raw = record.match(/^data:\s*(.*)$/m)?.[1];
            if (!raw || raw === "[DONE]") continue;
            let value: unknown;
            try { value = JSON.parse(raw); } catch { continue; }
            if (!value || typeof value !== "object") continue;
            const choices = "choices" in value && Array.isArray(value.choices) ? value.choices : [];
            const first = choices[0];
            const delta = first && typeof first === "object" && "delta" in first && first.delta && typeof first.delta === "object" ? first.delta : null;
            const content = delta && "content" in delta && typeof delta.content === "string" ? delta.content : "";
            if (content) {
              text += content;
              controller.enqueue(sse("response.output_text.delta", { type: "response.output_text.delta", item_id: messageId, output_index: 0, content_index: 0, delta: content }));
            }
            if ("usage" in value) usage = value.usage;
          }
        }
        controller.enqueue(sse("response.output_text.done", { type: "response.output_text.done", item_id: messageId, output_index: 0, content_index: 0, text }));
        controller.enqueue(sse("response.content_part.done", { type: "response.content_part.done", item_id: messageId, output_index: 0, content_index: 0, part: { type: "output_text", text, annotations: [] } }));
        controller.enqueue(sse("response.output_item.done", { type: "response.output_item.done", output_index: 0, item: { id: messageId, type: "message", status: "completed", role: "assistant", content: [{ type: "output_text", text, annotations: [] }] } }));
        controller.enqueue(sse("response.completed", { type: "response.completed", response: { id: responseId, object: "response", created_at: created, status: "completed", model, output: [{ id: messageId, type: "message", status: "completed", role: "assistant", content: [{ type: "output_text", text, annotations: [] }] }], output_text: text, ...(usage !== undefined ? { usage } : {}) } }));
        controller.close();
      } catch (error) { controller.error(error); }
    },
  });
  return new Response(stream, { status: upstream.status, headers: { "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-cache", "x-capi-request-id": requestId, "x-capi-channel": upstream.headers.get("x-capi-channel") ?? "" } });
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
