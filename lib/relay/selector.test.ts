import { describe, expect, test } from "bun:test";

import { selectChannel } from "./selector";
import { RelayRegistry } from "./store";

describe("channel selection", () => {
  test("selects the highest remaining priority without double-skipping failures", async () => {
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
      const middle = await registry.createChannel({
        ...high,
        name: "middle",
        keys: ["middle-key"],
        priority: 5,
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
      ).toMatchObject({ channel: { id: high.id }, priority: 10 });
      expect(
        selectChannel(registry, {
          group: "default",
          model: "gpt-4o",
          retry: 0,
          excludeIds: [high.id],
        }),
      ).toMatchObject({ channel: { id: middle.id }, priority: 5 });
      expect(selectChannel(registry, {
        group: "default", model: "gpt-4o", retry: 1, excludeIds: [high.id],
      })).toMatchObject({ channel: { id: middle.id }, priority: 5 });
      expect(selectChannel(registry, {
        group: "default", model: "gpt-4o", retry: 2, excludeIds: [high.id, middle.id],
      })).toMatchObject({ channel: { id: low.id }, priority: 0 });
    } finally {
      registry.database.close();
    }
  });
});
