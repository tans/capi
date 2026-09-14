import { describe, expect, test } from "bun:test";

import {
  assertModelAllowed,
  extractRawKey,
  ipAllowed,
  parseKey,
} from "./keys";
import type { ApiKey } from "./types";

const apiKey: ApiKey = {
  id: 1,
  userId: 1,
  name: "test",
  key: "test-key",
  status: 1,
  group: "default",
  modelLimitsEnabled: true,
  modelLimits: ["gpt-4o", "claude-*"],
  allowIps: [],
  remainQuota: 100,
  unlimitedQuota: false,
  usedQuota: 0,
  expiredTime: -1,
  createdTime: 0,
  accessedTime: 0,
  crossGroupRetry: false,
  autoGroups: [],
};

describe("API key request parsing", () => {
  test("prefers bearer credentials over alternate transport", () => {
    const request = new Request("https://capi.test/v1/models?key=query-key", {
      headers: { authorization: "Bearer bearer-key", "x-api-key": "header-key" },
    });

    expect(extractRawKey(request)).toBe("bearer-key");
    expect(extractRawKey(new Request("https://capi.test/v1/models", {
      headers: { "x-api-key": "header-key" },
    }))).toBe("header-key");
    expect(extractRawKey(new Request("https://capi.test/v1/models?key=query-key"))).toBe("query-key");
    expect(parseKey("sk-test-key-42")).toEqual({ key: "test-key", pinChannelId: 42 });
  });

  test("matches exact, normalized, and wildcard model limits", () => {
    expect(() => assertModelAllowed(apiKey, "gpt-4o@openai")).not.toThrow();
    expect(() => assertModelAllowed(apiKey, "claude-sonnet-5")).not.toThrow();
    expect(() => assertModelAllowed(apiKey, "gemini-3-pro")).toThrow("not in the allow list");
  });

  test("matches IPv4 CIDR allow lists and rejects malformed inputs", () => {
    expect(ipAllowed("10.0.12.3", ["10.0.0.0/8"])).toBe(true);
    expect(ipAllowed("10.0.12.3", ["10.1.0.0/16"])).toBe(false);
    expect(ipAllowed("not-an-ip", ["0.0.0.0/0"])).toBe(false);
  });
});
