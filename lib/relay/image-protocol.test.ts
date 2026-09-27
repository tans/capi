import { describe, expect, test } from "bun:test";

import {
  buildImageProtocolRequest,
  imageTaskId,
  imageTaskResult,
  imageTaskStatus,
  imageTaskStatusEndpoint,
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

  test("maps standard image sizes and polls an async image task", () => {
    const asyncConfig: ImageProtocolConfig = {
      version: 1,
      endpoint: "/api/v1/images/generations",
      auth: { type: "bearer" },
      request: {
        model: { from: "model" },
        prompt: { from: "prompt" },
        size: { from: "size", default: "1:1", map: { "1024x1024": "1:1", "1536x1024": "3:2", "1024x1536": "2:3" } },
        resolution: { value: "1K" },
        n: { from: "n", default: 1 },
      },
      response: { imagesPath: "data", urlPath: "$" },
      task: {
        idPath: "data.0.task_id",
        statusEndpoint: "/api/v1/tasks/{task_id}",
        statusPath: "data.status",
        resultImagesPath: "data.result.images",
      },
    };
    expect(validateImageProtocolConfig(asyncConfig)).toBe(true);
    expect(validateImageProtocolConfig({ ...asyncConfig, task: { ...asyncConfig.task!, statusEndpoint: "//other.example/{task_id}" } })).toBe(false);
    expect(validateImageProtocolConfig({ ...asyncConfig, task: { ...asyncConfig.task!, statusEndpoint: "/tasks/{task_id}/{task_id}" } })).toBe(false);
    expect(buildImageProtocolRequest(asyncConfig, { model: "gpt-image-2.5-1k", prompt: "A cat", size: "1024x1024" }).body).toEqual({
      model: "gpt-image-2.5-1k", prompt: "A cat", size: "1:1", resolution: "1K", n: 1,
    });
    expect(imageTaskId(asyncConfig, { data: [{ task_id: "task/a" }] })).toBe("task/a");
    expect(imageTaskStatus(asyncConfig, { data: { status: "completed" } })).toBe("completed");
    expect(imageTaskStatusEndpoint(asyncConfig, "task/a")).toBe("/api/v1/tasks/task%2Fa");
    expect(normalizeImageProtocolResponse(asyncConfig, imageTaskResult(asyncConfig, {
      data: { result: { images: ["https://images.example/a.png"] } },
    })).data).toEqual([{ url: "https://images.example/a.png" }]);
  });
});
