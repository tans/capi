#!/usr/bin/env bun

export {};
type JsonBody = any;

const base = (process.env.CAPI_SMOKE_BASE_URL || "http://127.0.0.1:3210").replace(/\/$/, "");
const email = process.env.CAPI_SMOKE_EMAIL || "";
const password = process.env.CAPI_SMOKE_PASSWORD || "";
const shouldRegister = process.env.CAPI_SMOKE_REGISTER === "1";
const redeemCode = process.env.CAPI_SMOKE_REDEEM_CODE || "";
const runLive = process.env.CAPI_SMOKE_LIVE === "1";

if (!email || !password) {
  console.error("Set CAPI_SMOKE_EMAIL and CAPI_SMOKE_PASSWORD.");
  process.exit(2);
}

let cookie = "";
const log = (name: string, detail = "") => console.log(`✓ ${name}${detail ? ` — ${detail}` : ""}`);

async function request(path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers || {});
  if (cookie) headers.set("cookie", cookie);
  if (!headers.has("content-type") && init.body) headers.set("content-type", "application/json");
  if (init.method && init.method !== "GET") headers.set("origin", base);
  const response = await fetch(base + path, { ...init, headers });
  const setCookie = response.headers.get("set-cookie");
  if (setCookie) cookie = setCookie.split(";", 1)[0];
  let body: JsonBody = null;
  const text = await response.text();
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  return { response, body };
}

function expect(ok: unknown, message: string, body?: unknown): asserts ok {
  if (!ok) {
    console.error(`✗ ${message}`);
    if (body !== undefined) console.error(typeof body === "string" ? body : JSON.stringify(body, null, 2));
    process.exit(1);
  }
}

if (shouldRegister) {
  const { response, body } = await request("/api/auth/register", {
    method: "POST",
    body: JSON.stringify({ email, password, name: "CAPI Smoke" }),
  });
  expect(response.status === 201 || response.status === 409, `register returned ${response.status}`, body);
  if (response.status === 201) log("register");
}

{
  const { response, body } = await request("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  expect(response.ok, `login returned ${response.status}`, body);
  expect(cookie.startsWith("capi_session="), "login did not issue session cookie", body);
  log("login");
}

{
  const { response, body } = await request("/api/auth/me");
  expect(response.ok && body?.user?.email === email.toLowerCase(), `session check returned ${response.status}`, body);
  log("session", body.user.email);
}

const workspacesResult = await request("/api/workspaces");
expect(workspacesResult.response.ok, `workspace list returned ${workspacesResult.response.status}`, workspacesResult.body);
const workspace = workspacesResult.body?.data?.find((item) => item.kind === "personal") || workspacesResult.body?.data?.[0];
expect(workspace?.id, "no workspace found", workspacesResult.body);
const workspaceId = workspace.id;
log("workspace", `${workspaceId} ${workspace.name || ""}`);

if (redeemCode) {
  const { response, body } = await request("/api/user/redeem", {
    method: "POST",
    body: JSON.stringify({ code: redeemCode, workspaceId }),
  });
  expect(response.ok, `redeem returned ${response.status}`, body);
  log("redeem", `${body.amount} ${body.currency}`);
}

const keyResult = await request(`/api/workspaces/${workspaceId}/keys`, {
  method: "POST",
  body: JSON.stringify({
    name: `smoke-${Date.now()}`,
    scopes: "llm.chat,image.generate,video.generate,llm.evaluate,billing.read",
  }),
});
expect(keyResult.response.status === 201, `key creation returned ${keyResult.response.status}`, keyResult.body);
const apiKey = keyResult.body?.secret;
const keyId = keyResult.body?.id;
expect(typeof apiKey === "string" && apiKey.startsWith("capi_sk_live_"), "key creation did not return a usable secret", keyResult.body);
log("api key");

async function api(path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers || {});
  headers.set("authorization", `Bearer ${apiKey}`);
  if (!headers.has("content-type") && init.body) headers.set("content-type", "application/json");
  const response = await fetch(base + path, { ...init, headers });
  const text = await response.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  return { response, body };
}

const modelsResult = await api("/v1/models");
expect(modelsResult.response.ok && Array.isArray(modelsResult.body?.data), `models returned ${modelsResult.response.status}`, modelsResult.body);
log("models", `${modelsResult.body.data.length} available`);

const balanceResult = await api("/v1/me/balance");
expect(balanceResult.response.ok && balanceResult.body?.balance, `balance returned ${balanceResult.response.status}`, balanceResult.body);
log("balance", `${balanceResult.body.balance.amount} ${balanceResult.body.balance.currency}`);

if (runLive) {
  const chatModel = process.env.CAPI_SMOKE_CHAT_MODEL || modelsResult.body.data.find((m: JsonBody) => !m.modality || m.modality === "text")?.id;
  expect(chatModel, "CAPI_SMOKE_LIVE=1 but no chat model is available; set CAPI_SMOKE_CHAT_MODEL");

  const chat = await api("/v1/chat/completions", {
    method: "POST",
    body: JSON.stringify({
      model: chatModel,
      messages: [{ role: "user", content: "Reply with exactly: smoke-ok" }],
      max_tokens: 32,
    }),
  });
  expect(chat.response.ok, `chat returned ${chat.response.status}`, chat.body);
  log("chat", chatModel);

  const imageModel = process.env.CAPI_SMOKE_IMAGE_MODEL;
  if (imageModel) {
    const image = await api("/v1/images/generations", {
      method: "POST",
      body: JSON.stringify({ model: imageModel, prompt: "A small black cat icon on a white background" }),
    });
    expect(image.response.ok, `image returned ${image.response.status}`, image.body);
    log("image", imageModel);
  }

  const videoModel = process.env.CAPI_SMOKE_VIDEO_MODEL;
  if (videoModel) {
    const video = await api("/v1/videos", {
      method: "POST",
      headers: { "idempotency-key": `smoke-${Date.now()}` },
      body: JSON.stringify({ model: videoModel, prompt: "A paper kite flying above a quiet coast" }),
    });
    expect(video.response.status === 200 || video.response.status === 202, `video returned ${video.response.status}`, video.body);
    const taskId = video.body?.id || video.body?.task_id;
    expect(taskId, "video submission did not return task id", video.body);
    log("video submit", taskId);

    const task = await api(`/v1/tasks/${encodeURIComponent(taskId)}`);
    expect(task.response.ok, `task lookup returned ${task.response.status}`, task.body);
    log("video task", task.body?.status || "unknown");
  }
}

if (keyId) {
  const deleted = await request(`/api/workspaces/${workspaceId}/keys?id=${encodeURIComponent(keyId)}`, { method: "DELETE" });
  expect(deleted.response.ok, `key cleanup returned ${deleted.response.status}`, deleted.body);
  log("key cleanup");
}

{
  const { response, body } = await request("/api/auth/logout", { method: "POST" });
  expect(response.ok, `logout returned ${response.status}`, body);
  log("logout");
}

console.log("\nCAPI smoke passed.");
