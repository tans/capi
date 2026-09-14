import { describe, expect, test } from "bun:test";

import { RelayRegistry } from "./store";

describe("RelayRegistry quota reservation", () => {
  test("allows only one reservation when concurrent requests exceed the remaining balance", async () => {
    const registry = new RelayRegistry(":memory:");
    try {
      const key = await registry.createKey({
        userId: 1,
        name: "quota-test",
        key: "quota-test-key",
        status: 1,
        group: "default",
        modelLimitsEnabled: false,
        modelLimits: [],
        allowIps: [],
        remainQuota: 100,
        unlimitedQuota: false,
        expiredTime: -1,
        crossGroupRetry: false,
        autoGroups: [],
      });

      const reservations = await Promise.all([
        registry.reserveQuota(key.id, 75),
        registry.reserveQuota(key.id, 75),
      ]);

      expect(reservations.filter(Boolean)).toHaveLength(1);
      expect(registry.getKey(key.id)).toMatchObject({
        remainQuota: 25,
        usedQuota: 75,
      });
    } finally {
      registry.database.close();
    }
  });

  test("does not reduce an unlimited key balance", async () => {
    const registry = new RelayRegistry(":memory:");
    try {
      const key = await registry.createKey({
        userId: 1,
        name: "unlimited-test",
        key: "unlimited-test-key",
        status: 1,
        group: "default",
        modelLimitsEnabled: false,
        modelLimits: [],
        allowIps: [],
        remainQuota: 0,
        unlimitedQuota: true,
        expiredTime: -1,
        crossGroupRetry: false,
        autoGroups: [],
      });

      expect(await registry.reserveQuota(key.id, 75)).toBe(true);
      expect(registry.getKey(key.id)).toMatchObject({
        remainQuota: 0,
        usedQuota: 75,
      });
    } finally {
      registry.database.close();
    }
  });

  test("chooses an untried upstream key before exhausting a channel", async () => {
    const registry = new RelayRegistry(":memory:");
    try {
      const channel = await registry.createChannel({
        name: "multi-key",
        type: "openai-compatible",
        baseUrl: "https://relay.test/v1",
        keys: ["first", "second"],
        multiKeyMode: "polling",
        models: ["test-model"],
        groups: ["default"],
        priority: 0,
        weight: 1,
        status: 1,
        autoBan: true,
      });

      expect(registry.pickUpstreamKey(channel)).toBe("first");
      expect(registry.hasUpstreamKey(channel, ["first"])).toBe(true);
      expect(registry.pickUpstreamKey(channel, ["first"])).toBe("second");
      expect(registry.hasUpstreamKey(channel, ["first", "second"])).toBe(false);
    } finally {
      registry.database.close();
    }
  });
});
