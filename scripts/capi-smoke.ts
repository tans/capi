import { existsSync } from "node:fs";
import { resolve } from "node:path";

type Target = "test" | "prod";

export type SmokeOptions = {
  target: Target;
  envFile: string;
  baseUrl?: string;
  apiKey?: string;
  chatModel?: string;
  evaluateModel?: string;
  checkBalance: boolean;
  timeoutMs: number;
};

type EnvMap = Record<string, string | undefined>;
type ApiResult = { status: number; body: unknown };

const repoRoot = resolve(import.meta.dir, "..");
const defaultEnvFile = resolve(repoRoot, "..", "capi-test", ".env");

const targetDefaults: Record<Target, { baseUrl: string; prefixes: string[] }> = {
  test: { baseUrl: "http://localhost:3210/api/v1", prefixes: ["CAPI_TEST", "TEST_CAPI"] },
  prod: { baseUrl: "https://capi.minapp.xin/api/v1", prefixes: ["CAPI_PROD", "CAPI_LIVE", "PROD_CAPI", "LIVE_CAPI"] },
};

function parseEnvValue(raw: string): string {
  const value = raw.trim();
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) return value.slice(1, -1);
  const commentIndex = value.search(/\s+#/);
  return (commentIndex === -1 ? value : value.slice(0, commentIndex)).trim();
}

export function parseEnvFile(contents: string): EnvMap {
  const values: EnvMap = {};
  for (const line of contents.split(/\r?\n/)) {
    const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (match) values[match[1]] = parseEnvValue(match[2]);
  }
  return values;
}

function firstValue(values: EnvMap, names: string[]): string | undefined {
  for (const name of names) {
    const value = values[name]?.trim();
    if (value) return value;
  }
  return undefined;
}

function targetNames(target: Target, suffix: string): string[] {
  return [
    ...targetDefaults[target].prefixes.map((prefix) => `${prefix}_${suffix}`),
    `${target.toUpperCase()}_${suffix}`,
    `CAPI_${suffix}`,
    `CAPI_API_${suffix}`,
    `${target.toUpperCase()}_CAPI_${suffix}`,
  ];
}

export function resolveConfig(options: Partial<SmokeOptions>, fileValues: EnvMap, processValues: EnvMap = process.env): SmokeOptions {
  const targetValue = options.target ?? (firstValue(processValues, ["CAPI_SMOKE_TARGET", "CAPI_ENV"]) as Target | undefined) ?? "test";
  if (targetValue !== "test" && targetValue !== "prod") throw new Error(`Unsupported target: ${targetValue}. Use test or prod.`);
  const target = targetValue;
  const merged = { ...fileValues, ...processValues };
  const envFile = options.envFile ?? defaultEnvFile;
  const baseUrl = options.baseUrl ?? firstValue(merged, targetNames(target, "BASE_URL")) ?? targetDefaults[target].baseUrl;
  const apiKey = options.apiKey ?? firstValue(merged, targetNames(target, "API_KEY")) ?? firstValue(merged, targetNames(target, "KEY"));
  const chatModel = options.chatModel ?? firstValue(merged, ["CAPI_SMOKE_CHAT_MODEL", `${target.toUpperCase()}_CAPI_CHAT_MODEL`]);
  const evaluateModel = options.evaluateModel ?? firstValue(merged, ["CAPI_SMOKE_EVALUATE_MODEL", `${target.toUpperCase()}_CAPI_EVALUATE_MODEL`]);
  const timeoutMs = Number(firstValue(merged, ["CAPI_SMOKE_TIMEOUT_MS"]) ?? "30000");
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 120000) throw new Error("CAPI_SMOKE_TIMEOUT_MS must be an integer between 1000 and 120000.");
  return { target, envFile, baseUrl: baseUrl.replace(/\/+$/, ""), apiKey, chatModel, evaluateModel, checkBalance: options.checkBalance ?? false, timeoutMs };
}

export function maskSecret(secret: string | undefined): string {
  if (!secret) return "(missing)";
  if (secret.length <= 8) return "********";
  return `${secret.slice(0, 4)}...${secret.slice(-4)}`;
}

function redact(value: string, secret?: string): string {
  const withSecretRemoved = secret ? value.split(secret).join("[redacted]") : value;
  return withSecretRemoved.replace(/capi_(?:sk|pk)_[A-Za-z0-9_-]+/g, "[redacted]");
}

async function requestJson(options: SmokeOptions, path: string, init: RequestInit = {}): Promise<ApiResult> {
  const response = await fetch(`${options.baseUrl}${path}`, {
    ...init,
    headers: { authorization: `Bearer ${options.apiKey}`, ...(init.body ? { "content-type": "application/json" } : {}), ...(init.headers ?? {}) },
    signal: AbortSignal.timeout(options.timeoutMs),
  });
  const text = await response.text();
  let body: unknown = text;
  try { body = text ? JSON.parse(text) : null; } catch { /* Keep raw text for status-only errors. */ }
  return { status: response.status, body };
}

function errorMessage(body: unknown): string {
  if (!body || typeof body !== "object") return "unexpected response";
  const error = (body as { error?: unknown }).error;
  if (typeof error === "string") return error;
  if (error && typeof error === "object" && typeof (error as { message?: unknown }).message === "string") return (error as { message: string }).message;
  return "unexpected response";
}

function modelIds(body: unknown): string[] {
  if (!body || typeof body !== "object" || !Array.isArray((body as { data?: unknown }).data)) return [];
  return (body as { data: Array<{ id?: unknown }> }).data.map((entry) => typeof entry?.id === "string" ? entry.id : "").filter(Boolean);
}

export function chooseChatModel(ids: string[], configured?: string): string | undefined {
  if (configured) return configured;
  return ids.find((id) => !/jev|judge|eval/i.test(id));
}

export function chooseEvaluateModel(ids: string[], configured?: string): string | undefined {
  if (configured) return configured;
  return ids.find((id) => /jev|judge|eval/i.test(id));
}

function usage(): void {
  console.log(`Usage: bun run test:smoke -- [options]

Options:
  --target, --env <test|prod>  Select the key/base URL pair (default: test)
  --env-file <path>            Read credentials from this dotenv file
  --base-url <url>             Override the selected target base URL
  --api-key <key>              Override the selected target API key
  --chat-model <model>         Use an explicit chat model
  --evaluate-model <model>     Use an explicit evaluation model
  --check-balance              Check /me/balance (scope errors are skipped)
  --timeout <ms>               Request timeout (1000-120000)
  --help                       Show this help

Expected dotenv names:
  CAPI_TEST_API_KEY / CAPI_TEST_BASE_URL
  CAPI_PROD_API_KEY / CAPI_PROD_BASE_URL
  CAPI_SMOKE_CHAT_MODEL / CAPI_SMOKE_EVALUATE_MODEL (optional)

The default env file is ../capi-test/.env relative to this repository.`);
}

function parseArgs(args: string[]): Partial<SmokeOptions> & { help?: boolean } {
  const parsed: Partial<SmokeOptions> & { help?: boolean } = {};
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--help" || arg === "-h") { parsed.help = true; continue; }
    const [name, inlineValue] = arg.split("=", 2);
    const takesValue = name !== "--check-balance";
    const value = inlineValue ?? (takesValue ? args[++index] : undefined);
    if (takesValue && !value) throw new Error(`Missing value for ${name}.`);
    if (name === "--target" || name === "--env") parsed.target = value as Target;
    else if (name === "--env-file") parsed.envFile = resolve(value as string);
    else if (name === "--base-url") parsed.baseUrl = value;
    else if (name === "--api-key") parsed.apiKey = value;
    else if (name === "--chat-model") parsed.chatModel = value;
    else if (name === "--evaluate-model") parsed.evaluateModel = value;
    else if (name === "--timeout") parsed.timeoutMs = Number(value);
    else if (name === "--check-balance") parsed.checkBalance = true;
    else throw new Error(`Unknown option: ${name}.`);
  }
  return parsed;
}

function printResult(label: string, status: "pass" | "skip" | "fail", detail: string): void {
  const symbol = status === "pass" ? "PASS" : status === "skip" ? "SKIP" : "FAIL";
  (status === "fail" ? console.error : console.log)(`${symbol} ${label}: ${detail}`);
}

export async function runSmoke(options: SmokeOptions): Promise<number> {
  if (!options.apiKey) throw new Error("No API key found. Set CAPI_TEST_API_KEY/CAPI_PROD_API_KEY in capi-test/.env or pass --api-key.");
  console.log(`CAPI smoke test (${options.target})`);
  console.log(`base URL: ${options.baseUrl}`);
  console.log(`API key: ${maskSecret(options.apiKey)}`);
  let passed = 0; let skipped = 0; let failed = 0;
  const mark = (status: "pass" | "skip" | "fail", label: string, detail: string) => { if (status === "pass") passed += 1; else if (status === "skip") skipped += 1; else failed += 1; printResult(label, status, detail); };

  let models: string[] = [];
  try {
    const result = await requestJson(options, "/models");
    if (result.status !== 200) mark("fail", "models", `${result.status} ${redact(errorMessage(result.body), options.apiKey)}`);
    else { models = modelIds(result.body); mark(models.length > 0 ? "pass" : "fail", "models", `${result.status}, ${models.length} model(s)`); }
  } catch (error) { mark("fail", "models", redact(error instanceof Error ? error.message : String(error), options.apiKey)); }

  const chatModel = chooseChatModel(models, options.chatModel);
  if (!chatModel) mark("skip", "chat", "no chat model found (set --chat-model to choose one)");
  else {
    try {
      const result = await requestJson(options, "/chat/completions", { method: "POST", body: JSON.stringify({ model: chatModel, messages: [{ role: "user", content: "Reply with exactly: capi test ok" }] }) });
      const choices = result.body && typeof result.body === "object" && Array.isArray((result.body as { choices?: unknown }).choices) ? (result.body as { choices: unknown[] }).choices : [];
      mark(result.status === 200 && choices.length > 0 ? "pass" : "fail", "chat", `${chatModel} -> ${result.status}`);
    } catch (error) { mark("fail", "chat", redact(error instanceof Error ? error.message : String(error), options.apiKey)); }
  }

  const evaluateModel = chooseEvaluateModel(models, options.evaluateModel);
  if (!evaluateModel) mark("skip", "evaluate", "no evaluation model found");
  else {
    try {
      const result = await requestJson(options, "/evaluate", { method: "POST", body: JSON.stringify({ model: evaluateModel, state: "A customer asks for a refund.", questions: { refund: { type: "boolean", instructions: "Is the customer asking for a refund?" } } }) });
      const answers = result.body && typeof result.body === "object" ? (result.body as { answers?: unknown }).answers : undefined;
      mark(result.status === 200 && answers && typeof answers === "object" ? "pass" : "fail", "evaluate", `${evaluateModel} -> ${result.status}`);
    } catch (error) { mark("fail", "evaluate", redact(error instanceof Error ? error.message : String(error), options.apiKey)); }
  }

  if (options.checkBalance) {
    try {
      const result = await requestJson(options, "/me/balance");
      if (result.status === 200) mark("pass", "balance", "200");
      else if (result.status === 401 || result.status === 403) mark("skip", "balance", `${result.status} (key lacks billing.read)`);
      else mark("fail", "balance", `${result.status} ${redact(errorMessage(result.body), options.apiKey)}`);
    } catch (error) { mark("fail", "balance", redact(error instanceof Error ? error.message : String(error), options.apiKey)); }
  }
  console.log(`Summary: ${passed} passed, ${skipped} skipped, ${failed} failed.`);
  return failed === 0 ? 0 : 1;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) { usage(); return; }
  const envFile = args.envFile ?? defaultEnvFile;
  if (!existsSync(envFile) && !args.apiKey) throw new Error(`Env file not found: ${envFile}. Create it or pass --env-file/--api-key.`);
  const fileValues = existsSync(envFile) ? parseEnvFile(await Bun.file(envFile).text()) : {};
  process.exitCode = await runSmoke(resolveConfig({ ...args, envFile }, fileValues));
}

if (import.meta.main) main().catch((error) => { console.error(`ERROR ${error instanceof Error ? error.message : String(error)}`); process.exitCode = 1; });
