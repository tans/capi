import { describe, expect, test } from "bun:test";

import { defaultSettings } from "./config";
import {
  computeQuota,
  formatMatchingModelName,
  matchRatio,
} from "./pricing";

describe("relay pricing", () => {
  test("normalizes provider suffixes and chooses the most specific wildcard", () => {
    expect(formatMatchingModelName(" gpt-4o@openai ")).toBe("gpt-4o");
    expect(
      matchRatio(
        { "gpt-*": 1, "gpt-4*": 2, "gpt-4o*": 3 },
        "gpt-4o-mini",
      ),
    ).toBe(3);
  });

  test("charges per-call models independently of token usage", () => {
    const quote = computeQuota(
      defaultSettings,
      "kling-v3-turbo-text-to-video",
      { promptTokens: 1_000_000, completionTokens: 1_000_000 },
      "default",
      "default",
    );

    expect(quote.perCallPrice).toBe(0.07);
    expect(quote.quota).toBe(35_000);
  });
});
