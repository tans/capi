import { describe, expect, test } from "bun:test";

import { selectChannel } from "./selector";
import { RelayRegistry } from "./store";

describe("channel selection", () => {
  test("falls through priority layers and excludes failed channels", async () => {
    const registry = new RelayRegistry(":memory:");
    try {
      const high = await registry.createChannel({
        name: "high",
        type: "openai-compatible",
        baseUrl: "https://high.example/v1",
        keys: ["high-key"],
        multiKeyMode: "random",
        models: ["gpt-4o"],
        groups: ["default"],
        priority: 10,
        weight: 1,
        status: 1,
        autoBan: true,
      });
      const low = await registry.createChannel({
        name: "low",
        type: "openai-compatible",
        baseUrl: "https://low.example/v1",
        keys: ["low-key"],
        multiKeyMode: "random",
        models: ["gpt-4o"],
        groups: ["default"],
        priority: 0,
        weight: 1,
        status: 1,
        autoBan: true,
      });

      expect(
        selectChannel(registry, { group: "default", model: "gpt-4o", retry: 0 }),
      ).toMatchObject({ channel: { id: high.id }, priority: 10 });
      expect(
        selectChannel(registry, { group: "default", model: "gpt-4o", retry: 1 }),
      ).toMatchObject({ channel: { id: low.id }, priority: 0 });
      expect(
        selectChannel(registry, {
          group: "default",
          model: "gpt-4o",
          retry: 0,
          excludeIds: [high.id],
        }),
      ).toMatchObject({ channel: { id: low.id } });
    } finally {
      registry.database.close();
    }
  });
});
