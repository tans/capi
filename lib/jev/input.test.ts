import { describe, expect, test } from "bun:test";

import { extractChatUserText, extractResponsesUserText } from "./input";

describe("JEV inference input extraction", () => {
  test("keeps only user text from chat messages", () => {
    expect(extractChatUserText({ messages: [
      { role: "system", content: "hidden system" },
      { role: "user", content: "first" },
      { role: "assistant", content: "hidden answer" },
      { role: "user", content: [{ type: "text", text: "second" }, { type: "image_url", image_url: "https://example.com/a.png" }] },
    ] })).toBe("first\nsecond");
  });

  test("keeps only user text parts from responses input", () => {
    expect(extractResponsesUserText([
      { role: "developer", content: [{ type: "input_text", text: "hidden" }] },
      { role: "user", content: [{ type: "input_text", text: "keep" }, { type: "input_image", image_url: "data:image/png;base64,x" }] },
    ])).toBe("keep");
  });
});
