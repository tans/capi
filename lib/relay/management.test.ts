import { describe, expect, test } from "bun:test";

import { listInput, normalizeChannelInput, normalizeGroupInput } from "./management";
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

  test("normalizes key scopes, group, and budget consistently", () => {
    const result = normalizeKeyProvision({ name: " CI ", scopes: "llm.chat, llm.chat", budget: "1.25" });
    expect(result).toEqual({ ok: true, name: "CI", scopes: ["llm.chat"], group: "", budgetLimitQuota: 625000 });
    expect(normalizeKeyProvision({ name: "x", scopes: "unknown" })).toEqual({ ok: false, error: "Choose supported operation scopes" });
  });

  test("keeps an existing group and rejects unknown ones", () => {
    const groups = ["default", "VIP-2", "万能模型"];
    expect(normalizeKeyProvision({ name: "x", scopes: "llm.chat", group: " 万能模型 " }, groups)).toMatchObject({ ok: true, group: "万能模型" });
    expect(normalizeKeyProvision({ name: "x", scopes: "llm.chat", group: "vip-2" }, groups)).toMatchObject({ ok: true, group: "VIP-2" });
    expect(normalizeKeyProvision({ name: "x", scopes: "llm.chat", group: "" }, groups)).toMatchObject({ ok: true, group: "" });
    expect(normalizeKeyProvision({ name: "x", scopes: "llm.chat", group: "ghost" }, groups)).toEqual({ ok: false, error: "Choose an existing group or leave it empty" });
    expect(normalizeKeyProvision({ name: "x", scopes: "llm.chat", group: 7 }, groups)).toEqual({ ok: false, error: "group must be a string" });
  });
});

describe("relay group input normalization", () => {
  test("keeps names verbatim, defaults the display name, and applies create defaults", () => {
    expect(normalizeGroupInput({ name: " VIP-2 " })).toEqual({
      ok: true,
      value: { name: "VIP-2", displayName: "VIP-2", ratio: 1, description: "", status: 1 },
    });
  });

  test("accepts the upstream group names referenced by synced channels", () => {
    for (const name of ["万能模型", "内部测试", "培训A", "培训B"]) {
      expect(normalizeGroupInput({ name })).toMatchObject({ ok: true, value: { name } });
    }
    expect(normalizeGroupInput({ ratio: 2.5 }, { partial: true })).toEqual({ ok: true, value: { ratio: 2.5 } });
    expect(normalizeGroupInput({ name: "培训A" }, { partial: true })).toEqual({ ok: true, value: { name: "培训A" } });
  });

  test("rejects names that cannot be referenced by channels or keys", () => {
    for (const name of ["", "vip group", "vip,group", "a\nb", "x".repeat(33)]) {
      expect(normalizeGroupInput({ name })).toMatchObject({ ok: false });
    }
    expect(normalizeGroupInput({ name: "vip", ratio: -1 })).toMatchObject({ ok: false });
    expect(normalizeGroupInput({ name: "vip", status: 3 })).toMatchObject({ ok: false });
  });
});
