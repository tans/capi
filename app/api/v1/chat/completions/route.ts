import { isAuthorized, mockCompletion, unauthorized } from "@/lib/mock-api";

/**
 * OpenAI-compatible chat completions.
 *
 * Supports both buffered and streamed responses so the docs' examples work
 * verbatim. The generated text is canned — no model is called.
 */
export async function POST(request: Request) {
  if (!isAuthorized(request)) return unauthorized();

  let body: {
    model?: string;
    messages?: { role: string; content: string }[];
    stream?: boolean;
  };

  try {
    body = await request.json();
  } catch {
    return Response.json(
      { error: { type: "invalid_request_error", message: "Body must be JSON." } },
      { status: 400 },
    );
  }

  if (!body.model) {
    return Response.json(
      {
        error: {
          type: "invalid_request_error",
          code: "invalid_model",
          message: "Missing required parameter: model.",
          param: "model",
        },
      },
      { status: 400 },
    );
  }

  const prompt = body.messages?.at(-1)?.content ?? "";
  const content = mockCompletion(prompt);
  const id = `chatcmpl_${Math.random().toString(16).slice(2, 10)}`;

  if (body.stream) {
    const words = content.split(" ");
    const encoder = new TextEncoder();

    const stream = new ReadableStream({
      async start(controller) {
        const send = (payload: unknown) =>
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(payload)}\n\n`),
          );

        send({
          id,
          object: "chat.completion.chunk",
          model: body.model,
          choices: [{ index: 0, delta: { role: "assistant" }, finish_reason: null }],
        });

        for (const word of words) {
          send({
            id,
            object: "chat.completion.chunk",
            model: body.model,
            choices: [{ index: 0, delta: { content: `${word} ` }, finish_reason: null }],
          });
          await new Promise((resolve) => setTimeout(resolve, 25));
        }

        send({
          id,
          object: "chat.completion.chunk",
          model: body.model,
          choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
        });
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      },
    });

    return new Response(stream, {
      headers: {
        "content-type": "text/event-stream; charset=utf-8",
        "cache-control": "no-cache, no-transform",
        connection: "keep-alive",
      },
    });
  }

  const promptTokens = Math.max(8, Math.round(prompt.length / 4));

  return Response.json({
    id,
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model: body.model,
    choices: [
      {
        index: 0,
        message: { role: "assistant", content },
        finish_reason: "stop",
      },
    ],
    usage: {
      prompt_tokens: promptTokens,
      completion_tokens: content.split(" ").length,
      total_tokens: promptTokens + content.split(" ").length,
    },
    cost: { amount: 0.0008, currency: "USD" },
  });
}

export async function GET() {
  return Response.json({
    object: "list",
    data: [
      {
        id: "chat.completions",
        object: "endpoint",
        method: "POST",
        path: "/v1/chat/completions",
        note: "Send a POST request; GET is not supported on this route.",
      },
    ],
  });
}
