import { describe, expect, test } from "bun:test";
import { buildVideoStatusEndpoint, buildVideoSubmit, readVideoPath, validateVideoProtocolConfig, type VideoProtocolConfig } from "./video-protocol";

const chiyuanConfig: VideoProtocolConfig = {
  version: 1,
  submit: {
    endpoint: "/kling/image-to-video/{model}",
    request: {
      "contents.0.type": { value: "prompt" },
      "contents.0.text": { from: "prompt" },
      "contents.1.type": { value: "first_frame" },
      "contents.1.url": { from: "image_url" },
      "settings.duration": { from: "duration_seconds", default: 5 },
    },
  },
  taskIdPath: "id",
  requiredInput: ["image_url"],
  poll: {
    endpoint: "/kling/tasks?task_ids={id}",
    statusPath: "data.0.status",
    resultUrlPath: "data.0.outputs.0.url",
    successStatuses: ["completed"],
    failureStatuses: ["failed"],
  },
};

const xiaoguaiConfig: VideoProtocolConfig = {
  version: 1,
  submit: {
    endpoint: "/api/v1/videos/generations",
    request: {
      model: { from: "model" }, prompt: { from: "prompt" },
      duration: { from: "duration_seconds", default: 5 },
      first_frame_image: { from: "image_url" },
    },
  },
  taskIdPath: "data.0.task_id",
  poll: {
    endpoint: "/api/v1/tasks/{id}", statusPath: "data.status", resultUrlPath: "data.result.videos.0",
    successStatuses: ["completed"], failureStatuses: ["failed"],
  },
};

describe("video protocol config", () => {
  test("validates nested mappings and path placeholders", () => {
    expect(validateVideoProtocolConfig(chiyuanConfig)).toBe(true);
    expect(validateVideoProtocolConfig({ ...chiyuanConfig, submit: { ...chiyuanConfig.submit, endpoint: "https://evil.test/{model}" } })).toBe(false);
  });

  test("builds nested array request and URL-encodes provider model", () => {
    const built = buildVideoSubmit(chiyuanConfig, { model: "kling 3.0", prompt: "A test shot", image_url: "https://images.test/frame.png" });
    expect(built.endpoint).toBe("/kling/image-to-video/kling%203.0");
    expect(built.body).toEqual({
      contents: [{ type: "prompt", text: "A test shot" }, { type: "first_frame", url: "https://images.test/frame.png" }],
      settings: { duration: 5 },
    });
  });

  test("builds task query and reads nested task results", () => {
    expect(buildVideoStatusEndpoint(chiyuanConfig, "task/1")).toBe("/kling/tasks?task_ids=task%2F1");
    const result = { data: [{ status: "completed", outputs: [{ url: "https://video.test/result.mp4" }] }] };
    expect(readVideoPath(result, chiyuanConfig.poll.statusPath)).toBe("completed");
    expect(readVideoPath(result, chiyuanConfig.poll.resultUrlPath)).toBe("https://video.test/result.mp4");
  });

  test("supports the Xiaoguai submit and task result envelopes", () => {
    expect(validateVideoProtocolConfig(xiaoguaiConfig)).toBe(true);
    const mapped = buildVideoSubmit(xiaoguaiConfig, { model: "minimax-h3-fast", prompt: "Animate this", image_url: "https://images.test/frame.png" });
    expect(mapped.body).toEqual({ model: "minimax-h3-fast", prompt: "Animate this", duration: 5, first_frame_image: "https://images.test/frame.png" });
    expect(readVideoPath({ data: [{ task_id: "xg_123" }] }, xiaoguaiConfig.taskIdPath)).toBe("xg_123");
    expect(readVideoPath({ data: { status: "completed", result: { videos: ["https://video.test/x.mp4"] } } }, xiaoguaiConfig.poll.resultUrlPath)).toBe("https://video.test/x.mp4");
  });
});
