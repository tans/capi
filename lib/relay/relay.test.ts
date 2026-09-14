import { describe, expect, test } from "bun:test";

import { defaultSettings } from "./config";
import { RelayError } from "./errors";
import { shouldDisableChannel, shouldRetry } from "./relay";
import { isSupportedChannelType } from "./types";

describe("relay failure policy", () => {
  test("does not retry permanent skip status codes even when ranges match", () => {
    expect(
      shouldRetry(
        defaultSettings,
        new RelayError("gateway timeout", {
          retryable: true,
          upstreamStatusCode: 504,
        }),
      ),
    ).toBe(false);
  });

  test("auto-disables network errors and configured upstream credential failures", () => {
    expect(
      shouldDisableChannel(
        defaultSettings,
        new RelayError("network failure", { retryable: true }),
      ),
    ).toBe(true);
    expect(
      shouldDisableChannel(
        defaultSettings,
        new RelayError("invalid api key", {
          retryable: true,
          upstreamStatusCode: 401,
        }),
      ),
    ).toBe(true);
  });
});

describe("supported channel types", () => {
  test("accepts only protocols the relay can execute", () => {
    expect(isSupportedChannelType("openai")).toBe(true);
    expect(isSupportedChannelType("openai-compatible")).toBe(true);
    expect(isSupportedChannelType("anthropic")).toBe(false);
    expect(isSupportedChannelType("gemini")).toBe(false);
  });
});
