import { validateBaseUrl } from "./management";

/**
 * 上游模型发现：对应 New-API 渠道编辑页的 “Fetch from Upstream”，
 * 用渠道的 baseUrl + key 去拉上游 /models，供面板回填模型列表。
 */

/** 上游响应过慢时的兜底超时（毫秒）。 */
const DEFAULT_TIMEOUT_MS = 20_000;

export type UpstreamModelDiscoveryInput = {
  baseUrl: string;
  key: string;
  headers?: Record<string, string>;
  timeoutMs?: number;
};

export type UpstreamModelDiscoveryResult =
  | { ok: true; models: string[] }
  | { ok: false; error: string };

/** 拼接 OpenAI 兼容的模型列表路径，容忍 baseUrl 末尾的斜杠。 */
export function modelsEndpoint(baseUrl: string): string {
  return `${baseUrl.trim().replace(/\/+$/, "")}/models`;
}

function modelIdOf(entry: unknown): string | undefined {
  if (typeof entry === "string") return entry;
  if (!entry || typeof entry !== "object") return undefined;
  const { id, name } = entry as { id?: unknown; name?: unknown };
  return typeof id === "string" ? id : typeof name === "string" ? name : undefined;
}

/**
 * 从 OpenAI 兼容的 /models 响应里提取模型 id。
 * 兼容 { data: [{ id }] }、{ data: ["gpt-4o"] }、{ models: [{ id | name }] }；
 * 逐个 trim，丢弃空串，按出现顺序去重。
 */
export function parseUpstreamModelIds(payload: unknown): string[] {
  const container = payload as { data?: unknown; models?: unknown } | null;
  const entries = Array.isArray(container?.data)
    ? container.data
    : Array.isArray(container?.models)
      ? container.models
      : [];
  const models: string[] = [];
  for (const entry of entries) {
    const id = modelIdOf(entry)?.trim();
    if (id && !models.includes(id)) models.push(id);
  }
  return models;
}

/** 拉取上游模型列表；返回结构化结果，不抛异常。 */
export async function fetchUpstreamModels(
  input: UpstreamModelDiscoveryInput,
): Promise<UpstreamModelDiscoveryResult> {
  const invalid = validateBaseUrl(input.baseUrl);
  if (invalid) return { ok: false, error: invalid };

  let response: Response;
  try {
    response = await fetch(modelsEndpoint(input.baseUrl), {
      method: "GET",
      headers: { authorization: `Bearer ${input.key}`, ...input.headers },
      signal: AbortSignal.timeout(input.timeoutMs ?? DEFAULT_TIMEOUT_MS),
    });
  } catch {
    return { ok: false, error: "Unable to reach the upstream." };
  }

  if (!response.ok) return { ok: false, error: `Upstream responded with HTTP ${response.status}.` };

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    return { ok: false, error: "The upstream returned an invalid model list." };
  }

  const models = parseUpstreamModelIds(payload);
  if (!models.length) return { ok: false, error: "The upstream returned no models." };
  return { ok: true, models };
}
