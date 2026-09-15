import { describe, expect, test } from "bun:test";

import { RelayRegistry } from "./store";

function seedWorkspace(registry: RelayRegistry, balanceUnits: number) {
  registry.database.query(
    "INSERT INTO users (id, email, name, password_hash, created_at) VALUES (1, 'test@example.com', 'Test', 'hash', 1)",
  ).run();
  registry.database.query(
    "INSERT INTO workspaces (id, kind, name, created_by, personal_owner_user_id, created_at) VALUES (1, 'personal', 'Test', 1, 1, 1)",
  ).run();
  registry.database.query(
    "INSERT INTO workspace_members (workspace_id, user_id, role, created_at) VALUES (1, 1, 'owner', 1)",
  ).run();
  registry.database.query("INSERT INTO wallets (workspace_id, balance_units) VALUES (1, ?)").run(balanceUnits);
}

describe("RelayRegistry billing", () => {
  test("allows concurrent soft admission and settles into a negative balance", async () => {
    const registry = new RelayRegistry(":memory:");
    try {
      seedWorkspace(registry, 100);
      const key = await registry.createKey({
        userId: 1,
        workspaceId: 1,
        name: "quota-test",
        key: "quota-test-key",
        status: 1,
        group: "default",
        modelLimitsEnabled: false,
        modelLimits: [],
        allowIps: [],
        budgetLimitQuota: 100,
        expiredTime: -1,
        crossGroupRetry: false,
        autoGroups: [],
      });

      const reservations = await Promise.all([
        registry.reserveBilling("request-a", 1, key.id, 75),
        registry.reserveBilling("request-b", 1, key.id, 75),
      ]);

      expect(reservations.filter(Boolean)).toHaveLength(2);
      expect(registry.getKey(key.id)).toMatchObject({ budgetSpentQuota: 0 });
      expect(registry.database.query<{ reserved_units: number }, []>("SELECT reserved_units FROM wallets").get()).toEqual({ reserved_units: 0 });
      expect(await registry.finalizeBilling("request-a", 75, "settled")).toBe(true);
      expect(await registry.finalizeBilling("request-b", 75, "settled")).toBe(true);
      expect(registry.database.query<{ balance_units: number; reserved_units: number }, []>("SELECT balance_units, reserved_units FROM wallets").get()).toEqual({ balance_units: -50, reserved_units: 0 });
      expect(registry.database.query<{ delta_units: number }, []>("SELECT delta_units FROM wallet_entries WHERE request_id = 'request-a'").get()).toEqual({ delta_units: -75 });
    } finally {
      registry.database.close();
    }
  });

  test("stores only a hash while allowing an uncapped key to reserve wallet funds", async () => {
    const registry = new RelayRegistry(":memory:");
    try {
      seedWorkspace(registry, 100);
      const key = await registry.createKey({
        userId: 1,
        workspaceId: 1,
        name: "uncapped-test",
        key: "uncapped-test-key",
        status: 1,
        group: "default",
        modelLimitsEnabled: false,
        modelLimits: [],
        allowIps: [],
        budgetLimitQuota: null,
        expiredTime: -1,
        crossGroupRetry: false,
        autoGroups: [],
      });

      expect(registry.getKeyByKeyValue("uncapped-test-key")?.id).toBe(key.id);
      const persisted = registry.database.query<{ key_hash: string; key_prefix: string }, []>("SELECT key_hash, key_prefix FROM api_keys").get()!;
      expect(persisted.key_hash).not.toBe("uncapped-test-key");
      expect(persisted.key_prefix).toBe("uncapped-test-••••••••-key");
      expect(await registry.reserveBilling("request-c", 1, key.id, 75)).toBe(true);
    } finally {
      registry.database.close();
    }
  });

  test("rejects a key whose user is not a member of its workspace", async () => {
    const registry = new RelayRegistry(":memory:");
    try {
      seedWorkspace(registry, 100);
      registry.database.query(
        "INSERT INTO users (id, email, name, password_hash, created_at) VALUES (2, 'outsider@example.com', 'Outsider', 'hash', 1)",
      ).run();
      await expect(registry.createKey({
        userId: 2,
        workspaceId: 1,
        name: "invalid-owner",
        key: "invalid-owner-key",
        status: 1,
        group: "default",
        modelLimitsEnabled: false,
        modelLimits: [],
        allowIps: [],
        budgetLimitQuota: null,
        expiredTime: -1,
        crossGroupRetry: false,
        autoGroups: [],
      })).rejects.toThrow();
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
