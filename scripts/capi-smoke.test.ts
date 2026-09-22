import { describe, expect, test } from "bun:test";
import { chooseChatModel, chooseEvaluateModel, maskSecret, parseEnvFile, resolveConfig } from "./capi-smoke";

describe("capi smoke configuration", () => {
  test("parses dotenv exports, quotes, and comments", () => {
    expect(parseEnvFile("export CAPI_TEST_API_KEY='secret # value'\nCAPI_TEST_BASE_URL=https://example.test/api/v1 # local\nEMPTY=\n")).toEqual({ CAPI_TEST_API_KEY: "secret # value", CAPI_TEST_BASE_URL: "https://example.test/api/v1", EMPTY: "" });
  });

  test("resolves target-specific values from the env file", () => {
    const config = resolveConfig({ target: "prod", envFile: "/tmp/capi.env" }, { CAPI_PROD_API_KEY: "prod-secret", CAPI_PROD_BASE_URL: "https://prod.example/api/v1/" }, {});
    expect(config.apiKey).toBe("prod-secret");
    expect(config.baseUrl).toBe("https://prod.example/api/v1");
  });

  test("prefers explicit model names and avoids evaluation models for chat", () => {
    const ids = ["typesafe-ai/jev", "gpt-5.6-sol", "judge-v1"];
    expect(chooseChatModel(ids)).toBe("gpt-5.6-sol");
    expect(chooseEvaluateModel(ids)).toBe("typesafe-ai/jev");
    expect(chooseChatModel(ids, "custom-chat")).toBe("custom-chat");
  });

  test("masks credentials", () => {
    expect(maskSecret("capi_sk_live_123456")).toBe("capi...3456");
    expect(maskSecret(undefined)).toBe("(missing)");
  });
});
