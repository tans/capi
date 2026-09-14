import { describe, expect, test } from "bun:test";

import { listInput, normalizeChannelInput } from "./management";
import { normalizeKeyProvision } from "./keys";

describe("relay management input normalization", () => {
  test("deduplicates delimited channel fields and applies New-API defaults", () => {
    expect(listInput("gpt-4o, gpt-4o\ngpt-5")).toEqual(["gpt-4o", "gpt-5"]);
    const result = normalizeChannelInput({
      name: " OpenAI ", baseUrl: "https://api.openai.com/v1", models: "gpt-4o",
      keys: " key-a\nkey-a ",
    });
    expect(result).toEqual({ ok: true, value: expect.objectContaining({ name: "OpenAI", groups: ["default"], keys: ["key-a"], priority: 0, weight: 0, status: 1 }) });
  });

  test("rejects unsafe upstreams and invalid manual status", () => {
    expect(normalizeChannelInput({ name: "x", baseUrl: "http://127.0.0.1/v1", models: ["m"], keys: ["k"] })).toEqual({ ok: false, error: "Upstream URL must be public HTTPS and must not include credentials." });
    expect(normalizeChannelInput({ status: 4 }, { partial: true })).toEqual({ ok: false, error: "status must be 1, 2, or 3." });
  });

  test("normalizes key scopes and budget consistently", () => {
    const result = normalizeKeyProvision({ name: " CI ", scopes: "llm.chat, llm.chat", budget: "1.25" });
    expect(result).toEqual({ ok: true, name: "CI", scopes: ["llm.chat"], budgetLimitQuota: 625000 });
    expect(normalizeKeyProvision({ name: "x", scopes: "unknown" })).toEqual({ ok: false, error: "Choose supported operation scopes" });
  });
});
