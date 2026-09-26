import { describe, expect, test } from "bun:test";

import {
  buildImageProtocolRequest,
  normalizeImageProtocolResponse,
  validateImageProtocolConfig,
  type ImageProtocolConfig,
} from "./image-protocol";

const config: ImageProtocolConfig = {
  version: 1,
  endpoint: "/v2/pictures/create",
  auth: { type: "api-key-header", header: "X-API-Key" },
  request: {
    model: { from: "model" },
    "input.prompt": { from: "prompt" },
    "input.aspect_ratio": { from: "size", default: "1:1" },
    output_format: { value: "url" },
  },
  response: {
    imagesPath: "payload.images",
    urlPath: "asset.href",
    base64Path: "asset.base64",
    revisedPromptPath: "prompt_used",
  },
};

describe("image provider protocol mapping", () => {
  test("validates a versioned config and rejects unsafe endpoints", () => {
    expect(validateImageProtocolConfig(config)).toBe(true);
    expect(validateImageProtocolConfig({ ...config, endpoint: "//other.example/steal" })).toBe(false);
    expect(validateImageProtocolConfig({ ...config, endpoint: "/images/../admin" })).toBe(false);
    expect(validateImageProtocolConfig({ ...config, request: { prompt: { from: "prompt" }, model: { value: "fixed" } } })).toBe(false);
    expect(validateImageProtocolConfig({ ...config, request: { ...config.request, input: { value: "overlap" } } })).toBe(false);
  });

  test("maps canonical inputs into nested provider fields and applies defaults", () => {
    const result = buildImageProtocolRequest(config, { model: "sb-image-v1", prompt: "A red kite" });
    expect(result).toEqual({
      endpoint: "/v2/pictures/create",
      body: {
        model: "sb-image-v1",
        input: { prompt: "A red kite", aspect_ratio: "1:1" },
        output_format: "url",
      },
    });
  });

  test("normalizes provider URLs and base64 into OpenAI image data", () => {
    expect(normalizeImageProtocolResponse(config, {
      created: 123,
      payload: { images: [{ asset: { href: "https://images.example/a.png" }, prompt_used: "A red kite" }, { asset: { base64: "aW1hZ2U=" } }] },
    })).toEqual({
      created: 123,
      data: [
        { url: "https://images.example/a.png", revised_prompt: "A red kite" },
        { b64_json: "aW1hZ2U=" },
      ],
    });
  });

  test("supports provider responses that return image URLs as array values", () => {
    const directValues: ImageProtocolConfig = {
      ...config,
      response: { imagesPath: "images", urlPath: "$" },
    };
    expect(normalizeImageProtocolResponse(directValues, { images: ["https://images.example/a.png"] }).data).toEqual([
      { url: "https://images.example/a.png" },
    ]);
  });
});
