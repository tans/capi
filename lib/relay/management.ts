import { isBlockedUpstreamHost, isSupportedChannelType, type ChannelType, type GroupStatus, type MultiKeyMode } from "./types";
import type { NewChannelInput, NewGroupInput } from "./store";

type ChannelBody = Record<string, unknown>;

export type ChannelValidation =
  | { ok: true; value: Partial<NewChannelInput> }
  | { ok: false; error: string };

export function listInput(value: unknown): string[] {
  const values = Array.isArray(value) ? value : typeof value === "string" ? value.split(/[\n,]/) : [];
  return [...new Set(values.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean))];
}

function numberInput(value: unknown, field: string, fallback: number | undefined): { value?: number; error?: string } {
  if (value === undefined && fallback !== undefined) return { value: fallback };
  if (value === undefined) return {};
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return { error: `\`${field}\` must be a finite non-negative number.` };
  return { value };
}

export function validateBaseUrl(value: unknown): string | undefined {
  if (typeof value !== "string" || !value.trim()) return "`baseUrl` is required.";
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "https:" || url.username || url.password || isBlockedUpstreamHost(url.hostname)) {
      return "Upstream URL must be public HTTPS and must not include credentials.";
    }
  } catch {
    return "`baseUrl` must be a valid HTTPS URL.";
  }
  return undefined;
}

export function normalizeChannelInput(body: ChannelBody, options: { partial?: boolean; requireKeys?: boolean } = {}): ChannelValidation {
  const { partial = false, requireKeys = true } = options;
  const value: Record<string, unknown> = {};

  if (!partial || body.name !== undefined) {
    if (typeof body.name !== "string" || !body.name.trim() || body.name.trim().length > 100) return { ok: false, error: "name must contain 1–100 characters" };
    value.name = body.name.trim();
  }
  if (!partial || body.baseUrl !== undefined) {
    const error = validateBaseUrl(body.baseUrl);
    if (error) return { ok: false, error };
    value.baseUrl = (body.baseUrl as string).trim();
  }
  if (!partial || body.type !== undefined) {
    const type = body.type === undefined ? "openai-compatible" : body.type;
    if (!isSupportedChannelType(type)) return { ok: false, error: "Only OpenAI and OpenAI-compatible channels are supported." };
    value.type = type as ChannelType;
  }
  if (!partial || body.models !== undefined) {
    const models = listInput(body.models);
    if (!models.length) return { ok: false, error: "At least one model is required." };
    value.models = models;
  }
  if (!partial || body.keys !== undefined) {
    const keys = listInput(body.keys);
    if (requireKeys && !keys.length) return { ok: false, error: "At least one upstream key is required." };
    if (keys.length) value.keys = keys;
  }
  if (!partial || body.groups !== undefined) {
    const groups = listInput(body.groups);
    value.groups = groups.length ? groups : ["default"];
  }
  for (const field of ["priority", "weight"] as const) {
    const result = numberInput(body[field], field, partial ? undefined : field === "weight" ? 0 : 0);
    if (result.error) return { ok: false, error: result.error };
    if (result.value !== undefined) value[field] = result.value;
  }
  if (!partial || body.multiKeyMode !== undefined) {
    const mode = body.multiKeyMode === undefined ? "random" : body.multiKeyMode;
    if (mode !== "random" && mode !== "polling") return { ok: false, error: "multiKeyMode must be random or polling." };
    value.multiKeyMode = mode as MultiKeyMode;
  }
  if (!partial || body.status !== undefined) {
    const status = body.status === undefined ? 1 : body.status;
    if (status !== 1 && status !== 2 && status !== 3) return { ok: false, error: "status must be 1, 2, or 3." };
    value.status = status;
    if (status === 1) { value.autoDisabledAt = undefined; value.lastError = undefined; }
  }
  if (!partial || body.autoBan !== undefined) {
    if (body.autoBan !== undefined && typeof body.autoBan !== "boolean") return { ok: false, error: "autoBan must be a boolean." };
    value.autoBan = body.autoBan === undefined ? true : body.autoBan;
  }
  for (const field of ["videoSubmitPath", "videoStatusPath", "evaluatePath"] as const) {
    if (body[field] !== undefined) {
      if (typeof body[field] !== "string" || !body[field].trim() || !body[field].startsWith("/")) return { ok: false, error: `${field} must be an absolute path.` };
      value[field] = body[field].trim();
    }
  }
  for (const field of ["modelMapping", "headers", "paramOverride", "tag"] as const) {
    if (body[field] !== undefined) value[field] = body[field];
  }
  return { ok: true, value: value as Partial<NewChannelInput> };
}

export type GroupValidation =
  | { ok: true; value: Partial<NewGroupInput> }
  | { ok: false; error: string };

/**
 * Group names are kept verbatim because channels and API keys reference them as-is, and
 * upstream relays (New-API) hand out CJK names such as 万能模型. Whitespace and commas are
 * excluded because channel group lists are comma/newline separated.
 */
const GROUP_NAME = /^[^\s,]{1,32}$/u;

export function normalizeGroupInput(body: Record<string, unknown>, options: { partial?: boolean } = {}): GroupValidation {
  const { partial = false } = options;
  const value: Partial<NewGroupInput> = {};

  if (!partial || body.name !== undefined) {
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!GROUP_NAME.test(name)) return { ok: false, error: "name must be 1–32 characters without spaces or commas" };
    value.name = name;
  }
  if (!partial || body.displayName !== undefined) {
    const displayName = body.displayName ?? value.name;
    if (typeof displayName !== "string" || !displayName.trim() || displayName.trim().length > 60) return { ok: false, error: "displayName must contain 1–60 characters" };
    value.displayName = displayName.trim();
  }
  if (!partial || body.ratio !== undefined) {
    const ratio = body.ratio ?? 1;
    if (typeof ratio !== "number" || !Number.isFinite(ratio) || ratio < 0) return { ok: false, error: "ratio must be a finite non-negative number" };
    value.ratio = ratio;
  }
  if (!partial || body.description !== undefined) {
    const description = body.description ?? "";
    if (typeof description !== "string" || description.length > 200) return { ok: false, error: "description must be a string of at most 200 characters" };
    value.description = description.trim();
  }
  if (!partial || body.status !== undefined) {
    const status = body.status ?? 1;
    if (status !== 1 && status !== 2) return { ok: false, error: "status must be 1 (enabled) or 2 (disabled)" };
    value.status = (status === 2 ? 2 : 1) as GroupStatus;
  }
  return { ok: true, value };
}
