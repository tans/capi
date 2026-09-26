import { afterAll, beforeAll, expect, test } from "bun:test";
import { getRegistry } from "./store";
import { relayChatCompletion, relayResponses } from "./relay";
import { isTextModel, validateCombinedModel } from "./combined-models";
import { GET as listModels } from "../../app/api/v1/models/route";
import type { ApiKey, Channel } from "./types";

let registry: Awaited<ReturnType<typeof getRegistry>>;
let key: ApiKey;
let first: Channel;
let second: Channel;
const originalFetch = globalThis.fetch;
const calls: string[] = [];
let firstStatus = 503;

beforeAll(async () => {
  registry = await getRegistry();
  await registry.updateSettings({ retryTimes: 0 });
  const db = registry.database;
  const workspaceId = db.query<{ id: number }, []>("SELECT id FROM workspaces LIMIT 1").get()!.id;
  db.query("UPDATE wallets SET balance_units = 100000000 WHERE workspace_id = ?").run(workspaceId);
  db.query("INSERT INTO combined_models (workspace_id, name, models, updated_at) VALUES (?, ?, ?, ?)")
    .run(workspaceId, "resilient-chat", JSON.stringify(["first-model", "second-model"]), Date.now());
  key = await registry.createKey({
    key: "combined-test-key", userId: 1, workspaceId, name: "test", status: 1,
    group: "default", modelLimitsEnabled: false, modelLimits: [], scopes: ["llm.chat"],
    allowIps: [], budgetLimitQuota: null, expiredTime: -1, crossGroupRetry: false, autoGroups: [],
  });
  const channel = (name: string, model: string) => ({
    name, type: "openai-compatible" as const, baseUrl: `https://${name}.example/v1`, keys: ["test-upstream"],
    multiKeyMode: "polling" as const, models: [model], groups: ["default"], priority: 1,
    weight: 1, status: 1 as const, autoBan: false, ownerType: "workspace" as const, workspaceId,
  });
  first = await registry.createChannel(channel("first", "first-model"));
  second = await registry.createChannel({ ...channel("second", "second-model"), ownerType: "platform", workspaceId: undefined });
  globalThis.fetch = (async (input) => {
    const url = String(input);
    calls.push(url);
    if (url.includes("first.example")) return Response.json({ error: "unavailable" }, { status: firstStatus });
    return Response.json({ id: "done", usage: { prompt_tokens: 3, completion_tokens: 4 }, choices: [{ message: { content: "ok" } }] });
  }) as typeof fetch;
});

afterAll(() => { globalThis.fetch = originalFetch; });

test("validates ordered real-model combinations", () => {
  expect(validateCombinedModel({ name: "route", models: ["a", "b"] }, ["real"]).ok).toBe(true);
  expect(validateCombinedModel({ name: "real", models: ["a", "b"] }, ["real"]).ok).toBe(false);
  expect(validateCombinedModel({ name: "route", models: ["real", "b"] }, ["real"]).ok).toBe(true);
  expect(validateCombinedModel({ name: "route", models: ["other-combo", "b"] }, [], ["other-combo"]).ok).toBe(false);
  expect(validateCombinedModel({ name: "route", models: ["a", "a"] }, []).ok).toBe(false);
  expect(isTextModel("gpt-image-2")).toBe(false);
  expect(isTextModel("typesafe-ai/jev")).toBe(false);
  expect(isTextModel("self-hosted-text-model")).toBe(true);
});

test("chat falls through on upstream service failure and records actual model", async () => {
  calls.length = 0;
  firstStatus = 503;
  const response = await relayChatCompletion({ registry, apiKey: key, pinnedChannelId: null, requestId: "combo-chat-503", body: { model: "resilient-chat", messages: [{ role: "user", content: "hello" }] } });
  expect(response.status).toBe(200);
  expect(calls.map((url) => new URL(url).host)).toEqual(["first.example", "second.example"]);
  const usage = registry.listUsage({ keyId: key.id }).find((record) => record.requestId === "combo-chat-503");
  expect(usage?.model).toBe("second-model");
  expect(usage?.requestModel).toBe("resilient-chat");
  expect(usage?.channelId).toBe(second.id);
  expect(usage?.quota).toBeGreaterThan(0);
  const bill = registry.database.query<{ settled_units: number }, [string]>("SELECT settled_units FROM billing_requests WHERE request_id = ?").get("combo-chat-503");
  expect(bill?.settled_units).toBe(usage?.quota);
});

test("chat does not fall through on a request error", async () => {
  calls.length = 0;
  firstStatus = 400;
  await expect(relayChatCompletion({ registry, apiKey: key, pinnedChannelId: null, requestId: "combo-chat-400", body: { model: "resilient-chat", messages: [{ role: "user", content: "hello" }] } })).rejects.toMatchObject({ statusCode: 400 });
  expect(calls).toHaveLength(1);
});

test("chat skips a model with no available channel", async () => {
  calls.length = 0;
  await registry.updateChannel(first.id, { status: 3 });
  const response = await relayChatCompletion({ registry, apiKey: key, pinnedChannelId: null, requestId: "combo-chat-empty", body: { model: "resilient-chat", messages: [{ role: "user", content: "hello" }] } });
  expect(response.status).toBe(200);
  expect(calls.map((url) => new URL(url).host)).toEqual(["second.example"]);
  await registry.updateChannel(first.id, { status: 1 });
});

test("chat skips a channel with no upstream key", async () => {
  calls.length = 0;
  await registry.updateChannel(first.id, { keys: [] });
  const response = await relayChatCompletion({ registry, apiKey: key, pinnedChannelId: null, requestId: "combo-chat-no-key", body: { model: "resilient-chat", messages: [{ role: "user", content: "hello" }] } });
  expect(response.status).toBe(200);
  expect(calls.map((url) => new URL(url).host)).toEqual(["second.example"]);
  await registry.updateChannel(first.id, { keys: ["test-upstream"] });
});

test("Responses uses the same ordered fallback", async () => {
  calls.length = 0;
  firstStatus = 503;
  const response = await relayResponses({ registry, apiKey: key, pinnedChannelId: null, requestId: "combo-responses-503", body: { model: "resilient-chat", input: "hello" } });
  expect(response.status).toBe(200);
  expect(calls.map((url) => new URL(url).host)).toEqual(["first.example", "second.example"]);
  const usage = registry.listUsage({ keyId: key.id }).find((record) => record.requestId === "combo-responses-503");
  expect(usage?.model).toBe("second-model");
  expect(usage?.requestModel).toBe("resilient-chat");
  expect(usage?.quota).toBeGreaterThan(0);
});

test("a scoped key discovers the alias and uses only its permitted member", async () => {
  const scoped = await registry.createKey({
    key: "combined-scoped-key", userId: key.userId, workspaceId: key.workspaceId, name: "scoped", status: 1,
    group: "default", modelLimitsEnabled: true, modelLimits: ["second-model"], scopes: ["llm.chat"],
    allowIps: [], budgetLimitQuota: null, expiredTime: -1, crossGroupRetry: false, autoGroups: [],
  });
  const listing = await listModels(new Request("http://localhost/api/v1/models", { headers: { authorization: "Bearer combined-scoped-key" } }));
  expect(listing.status).toBe(200);
  const payload = await listing.json() as { data: { id: string }[] };
  expect(payload.data.some((item) => item.id === "resilient-chat")).toBe(true);
  calls.length = 0;
  const response = await relayChatCompletion({ registry, apiKey: scoped, pinnedChannelId: null, requestId: "combo-scoped", body: { model: "resilient-chat", messages: [{ role: "user", content: "hello" }] } });
  expect(response.status).toBe(200);
  expect(calls.map((url) => new URL(url).host)).toEqual(["second.example"]);
});
