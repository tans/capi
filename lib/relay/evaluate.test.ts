import { describe, expect, test } from "bun:test";

import {
  MAX_EVALUATE_QUESTIONS,
  buildEvaluateUpstreamPayload,
  estimateEvaluateTokens,
  evaluateEndpoint,
  extractEvaluateUsage,
  normalizeEvaluateBody,
  normalizeEvaluateResponse,
} from "./evaluate";
import { normalizeChannelInput } from "./management";

const validBody = {
  model: "typesafe-ai/jev",
  state: "I was charged twice for my subscription.",
  questions: { refund: { type: "boolean", instructions: "Is the customer asking for money back?" } },
};

describe("normalizeEvaluateBody", () => {
  test("accepts a well-formed evaluation request", () => {
    const result = normalizeEvaluateBody(validBody);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.model).toBe("typesafe-ai/jev");
  });

  test("requires model, state and questions", () => {
    expect(normalizeEvaluateBody({ ...validBody, model: "" })).toMatchObject({ ok: false });
    expect(normalizeEvaluateBody({ ...validBody, model: 7 })).toMatchObject({ ok: false });
    expect(normalizeEvaluateBody({ state: validBody.state, questions: validBody.questions })).toMatchObject({ ok: false });
    expect(normalizeEvaluateBody({ ...validBody, state: undefined })).toMatchObject({ ok: false });
    expect(normalizeEvaluateBody({ ...validBody, questions: undefined })).toMatchObject({ ok: false });
    expect(normalizeEvaluateBody({ ...validBody, questions: {} })).toMatchObject({ ok: false });
    expect(normalizeEvaluateBody({ ...validBody, questions: [] })).toMatchObject({ ok: false });
  });

  test("accepts string, object and array state but rejects other shapes", () => {
    expect(normalizeEvaluateBody({ ...validBody, state: { message: "charged twice" } }).ok).toBe(true);
    expect(normalizeEvaluateBody({ ...validBody, state: [{ role: "user", content: "charged twice" }] }).ok).toBe(true);
    expect(normalizeEvaluateBody({ ...validBody, state: 42 })).toMatchObject({ ok: false });
    expect(normalizeEvaluateBody({ ...validBody, state: null })).toMatchObject({ ok: false });
  });

  test("rejects unsupported question types and oversized requests", () => {
    expect(normalizeEvaluateBody({ ...validBody, questions: { refund: { type: "text" } } })).toMatchObject({ ok: false });
    expect(normalizeEvaluateBody({ ...validBody, questions: { refund: { instructions: "no type" } } })).toMatchObject({ ok: false });
    expect(normalizeEvaluateBody({ ...validBody, questions: { "": { type: "boolean" } } })).toMatchObject({ ok: false });
    expect(normalizeEvaluateBody({ ...validBody, questions: Object.fromEntries(Array.from({ length: MAX_EVALUATE_QUESTIONS + 1 }, (_, index) => [`q${index}`, { type: "boolean" }])) })).toMatchObject({ ok: false });
  });

  test("accepts choice and score questions", () => {
    const result = normalizeEvaluateBody({
      ...validBody,
      questions: {
        department: { type: "choice", instructions: "Which team?", criteria: { billing: "Payments" } },
        urgency: { type: "score", instructions: "How urgent?", criteria: ["low", "high"] },
      },
    });
    expect(result.ok).toBe(true);
  });

  test("accepts TypeSafe's noul question type", () => {
    expect(normalizeEvaluateBody({ ...validBody, questions: { urgent: { type: "noul", instructions: "Is this urgent?" } } }).ok).toBe(true);
  });

  test("rejects an over-long model id", () => {
    expect(normalizeEvaluateBody({ ...validBody, model: "x".repeat(201) })).toMatchObject({ ok: false });
  });
});

describe("TypeSafe channel adaptation", () => {
  test("maps CAPI boolean questions to TypeSafe noul questions", () => {
    const body = { ...validBody, questions: { urgent: { type: "boolean", instructions: "Is this urgent?" } } };
    expect(buildEvaluateUpstreamPayload(body, "typesafe", "jev-latest")).toEqual({
      ...body,
      model: "jev-latest",
      questions: { urgent: { type: "noul", instructions: "Is this urgent?" } },
    });
  });

  test("maps TypeSafe noul answers back to CAPI boolean answers", () => {
    expect(normalizeEvaluateResponse({
      model: "jev-latest",
      answers: { urgent: { type: "noul", noul: 0.95 } },
    }, { ...validBody, questions: { urgent: { type: "boolean" } } }, "typesafe")).toEqual({
      model: "typesafe-ai/jev",
      answers: { urgent: { type: "boolean", probability: 0.95 } },
    });
  });
});

describe("evaluateEndpoint", () => {
  test("defaults to /evaluate and tolerates trailing slashes", () => {
    expect(evaluateEndpoint({ baseUrl: "https://ai-gateway.vercel.sh/v1" })).toBe("https://ai-gateway.vercel.sh/v1/evaluate");
    expect(evaluateEndpoint({ baseUrl: "https://ai-gateway.vercel.sh/v1/" })).toBe("https://ai-gateway.vercel.sh/v1/evaluate");
  });

  test("honours a channel override and falls back on a relative path", () => {
    expect(evaluateEndpoint({ baseUrl: "https://example.com/v1", evaluatePath: "/score" })).toBe("https://example.com/v1/score");
    expect(evaluateEndpoint({ baseUrl: "https://example.com/v1", evaluatePath: "score" })).toBe("https://example.com/v1/evaluate");
    expect(evaluateEndpoint({ baseUrl: "https://example.com/v1", evaluatePath: "  " })).toBe("https://example.com/v1/evaluate");
  });
});

describe("extractEvaluateUsage", () => {
  const fallback = { promptTokens: 10, completionTokens: 0, cachedTokens: 0 };

  test("reads camelCase usage returned by evaluation providers", () => {
    expect(extractEvaluateUsage({ usage: { inputTokens: 275, outputTokens: 20 } }, fallback)).toEqual({ promptTokens: 275, completionTokens: 20, cachedTokens: 0 });
  });

  test("reads snake_case usage as well", () => {
    expect(extractEvaluateUsage({ usage: { input_tokens: 12, output_tokens: 4, cached_tokens: 2 } }, fallback)).toEqual({ promptTokens: 12, completionTokens: 4, cachedTokens: 2 });
  });

  test("falls back to the estimate when usage is missing", () => {
    expect(extractEvaluateUsage({}, fallback)).toEqual(fallback);
    expect(extractEvaluateUsage({ usage: {} }, fallback)).toEqual(fallback);
    expect(extractEvaluateUsage({ usage: { inputTokens: 5 } }, fallback)).toEqual({ promptTokens: 5, completionTokens: 0, cachedTokens: 0 });
  });
});

describe("estimateEvaluateTokens", () => {
  test("counts state and questions as input", () => {
    const tokens = estimateEvaluateTokens(validBody as never);
    expect(tokens).toBeGreaterThan(0);
    expect(estimateEvaluateTokens({ ...validBody, state: "" } as never)).toBeLessThan(tokens);
  });
});

describe("channel evaluatePath", () => {
  test("accepts an absolute path and rejects a relative one", () => {
    const ok = normalizeChannelInput({ name: "gw", type: "openai-compatible", baseUrl: "https://ai-gateway.vercel.sh/v1", keys: "k", models: "typesafe-ai/jev", evaluatePath: "/evaluate" }, { requireKeys: true });
    expect(ok.ok).toBe(true);
    if (ok.ok) expect(ok.value.evaluatePath).toBe("/evaluate");
    expect(normalizeChannelInput({ name: "gw", type: "openai-compatible", baseUrl: "https://ai-gateway.vercel.sh/v1", keys: "k", models: "m", evaluatePath: "evaluate" }, { requireKeys: true })).toMatchObject({ ok: false });
  });

  test("accepts TypeSafe evaluation channels", () => {
    expect(normalizeChannelInput({
      name: "typesafe",
      type: "openai-compatible",
      baseUrl: "https://api.typesafe.ai/v1",
      keys: "k",
      models: "typesafe-ai/jev",
      evaluateProtocol: "typesafe",
      evaluatePath: "/systemone",
    }, { requireKeys: true })).toMatchObject({ ok: true });
  });
});
