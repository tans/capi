import { describe, expect, test } from "bun:test";

import {
  AuthError,
  readAuthBody,
  requireSameOrigin,
  sessionToken,
} from "./auth";

describe("authentication request boundaries", () => {
  test("accepts only a correctly formatted session cookie", () => {
    const token = "a".repeat(43);
    expect(sessionToken(new Request("https://capi.test", {
      headers: { cookie: `other=value; capi_session=${token}` },
    }))).toBe(token);
    expect(sessionToken(new Request("https://capi.test", {
      headers: { cookie: "capi_session=short" },
    }))).toBeNull();
  });

  test("rejects cross-origin cookie mutations", () => {
    expect(() => requireSameOrigin(new Request("https://capi.test/api/auth/login", {
      headers: { origin: "https://attacker.test" },
    }))).toThrow(AuthError);
    expect(() => requireSameOrigin(new Request("https://capi.test/api/auth/login", {
      headers: { origin: "https://capi.test" },
    }))).not.toThrow();
    expect(() => requireSameOrigin(new Request("http://127.0.0.1:3210/api/auth/login", {
      headers: {
        origin: "https://capi.test",
        "x-forwarded-proto": "https",
        "x-forwarded-host": "capi.test",
      },
    }))).not.toThrow();
  });

  test("enforces JSON object and size boundaries", async () => {
    await expect(readAuthBody(new Request("https://capi.test", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "[]",
    }))).rejects.toMatchObject({ code: "invalid_body", status: 400 });
    await expect(readAuthBody(new Request("https://capi.test", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ value: "x".repeat(8192) }),
    }))).rejects.toMatchObject({ code: "body_too_large", status: 413 });
  });
});
