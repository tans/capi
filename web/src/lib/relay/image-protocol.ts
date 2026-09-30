/** Safe, declarative adapter for providers with JSON image-generation APIs. */
export type ImageInputField = string;

export type ImageValueMapping =
  | { from: ImageInputField; default?: string | number | boolean | null; map?: Record<string, string | number | boolean | null> }
  | { value: string | number | boolean | null };

export type ImageProtocolConfig = {
  version: 1;
  endpoint: string;
  auth?: { type: "bearer" } | { type: "api-key-header"; header: string };
  request: Record<string, ImageValueMapping>;
  response: {
    imagesPath: string;
    urlPath?: string;
    base64Path?: string;
    revisedPromptPath?: string;
  };
  task?: {
    idPath: string;
    statusEndpoint: string;
    statusPath: string;
    resultImagesPath: string;
    completedStatus?: string;
    failedStatus?: string;
    pollIntervalMs?: number;
  };
};

const SAFE_PATH_PART = /^[A-Za-z0-9_-]+$/;
const RESERVED_KEYS = new Set(["__proto__", "prototype", "constructor"]);
const CONFIG_MAX_BYTES = 16_384;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function validDataPath(value: unknown, allowRoot = false): value is string {
  if (typeof value !== "string" || !value.trim() || value.length > 200) return false;
  if (allowRoot && value.trim() === "$") return true;
  const parts = value.trim().replace(/^\$\.?/, "").split(".");
  return parts.length > 0 && parts.every((part) => SAFE_PATH_PART.test(part) && !RESERVED_KEYS.has(part));
}

function validEndpoint(value: unknown, allowTaskId = false): value is string {
  if (typeof value !== "string" || value.length > 200 || !value.startsWith("/") || value.startsWith("//") || /[?#\\\u0000-\u001f]/.test(value)) return false;
  const normalized = allowTaskId ? value.replace("{task_id}", "task-id") : value;
  if (allowTaskId && (value.match(/\{task_id\}/g)?.length ?? 0) !== 1) return false;
  if (!allowTaskId && /[{}]/.test(value)) return false;
  const parts = normalized.split("/");
  return parts.every((part) => part !== ".." && part !== ".") && !/%2e/i.test(value);
}

function validMapping(value: unknown): value is ImageValueMapping {
  if (!isPlainObject(value)) return false;
  const keys = Object.keys(value);
  if (keys.includes("from")) {
    return keys.every((key) => key === "from" || key === "default" || key === "map")
      && typeof value.from === "string"
      && validDataPath(value.from)
      && (value.default === undefined || value.default === null || ["string", "number", "boolean"].includes(typeof value.default))
      && (value.map === undefined || (isPlainObject(value.map)
        && Object.keys(value.map).length <= 64
        && Object.entries(value.map).every(([key, mapped]) => key.length <= 200 && (mapped === null || ["string", "number", "boolean"].includes(typeof mapped)))));
  }
  return keys.length === 1 && "value" in value
    && (value.value === null || ["string", "number", "boolean"].includes(typeof value.value));
}

export function validateImageProtocolConfig(value: unknown): value is ImageProtocolConfig {
  if (!isPlainObject(value) || Buffer.byteLength(JSON.stringify(value)) > CONFIG_MAX_BYTES) return false;
  if (Object.keys(value).some((key) => !["version", "endpoint", "auth", "request", "response", "task"].includes(key))) return false;
  if (value.version !== 1 || !validEndpoint(value.endpoint)) return false;
  if (value.auth !== undefined) {
    if (!isPlainObject(value.auth)) return false;
    if (value.auth.type === "bearer") {
      if (Object.keys(value.auth).some((key) => key !== "type")) return false;
    } else if (value.auth.type === "api-key-header") {
      if (Object.keys(value.auth).some((key) => key !== "type" && key !== "header")) return false;
      if (typeof value.auth.header !== "string" || !/^[!#$%&'*+.^_`|~0-9A-Za-z-]{1,80}$/.test(value.auth.header) || ["host", "content-length", "cookie"].includes(value.auth.header.toLowerCase())) return false;
    } else return false;
  }
  if (!isPlainObject(value.request) || Object.keys(value.request).length < 2 || Object.keys(value.request).length > 64) return false;
  let mapsModel = false;
  let mapsPrompt = false;
  const requestPaths = Object.keys(value.request);
  for (const [path, mapping] of Object.entries(value.request)) {
    if (!validDataPath(path) || !validMapping(mapping)) return false;
    if ("from" in mapping) {
      if (mapping.from === "model") mapsModel = true;
      if (mapping.from === "prompt") mapsPrompt = true;
    }
  }
  if (requestPaths.some((path, index) => requestPaths.some((other, otherIndex) => index !== otherIndex && other.startsWith(`${path}.`)))) return false;
  if (!mapsModel || !mapsPrompt) return false;
  if (!isPlainObject(value.response) || Object.keys(value.response).some((key) => !["imagesPath", "urlPath", "base64Path", "revisedPromptPath"].includes(key)) || !validDataPath(value.response.imagesPath)) return false;
  if (value.response.urlPath !== undefined && !validDataPath(value.response.urlPath, true)) return false;
  if (value.response.base64Path !== undefined && !validDataPath(value.response.base64Path, true)) return false;
  if (value.response.revisedPromptPath !== undefined && !validDataPath(value.response.revisedPromptPath, true)) return false;
  if (typeof value.response.urlPath !== "string" && typeof value.response.base64Path !== "string") return false;
  if (value.task !== undefined) {
    if (!isPlainObject(value.task)
      || Object.keys(value.task).some((key) => !["idPath", "statusEndpoint", "statusPath", "resultImagesPath", "completedStatus", "failedStatus", "pollIntervalMs"].includes(key))
      || !validDataPath(value.task.idPath)
      || !validEndpoint(value.task.statusEndpoint, true)
      || !validDataPath(value.task.statusPath)
      || !validDataPath(value.task.resultImagesPath)) return false;
    if (value.task.completedStatus !== undefined && (typeof value.task.completedStatus !== "string" || !value.task.completedStatus.trim() || value.task.completedStatus.length > 80)) return false;
    if (value.task.failedStatus !== undefined && (typeof value.task.failedStatus !== "string" || !value.task.failedStatus.trim() || value.task.failedStatus.length > 80)) return false;
    if (value.task.pollIntervalMs !== undefined && (typeof value.task.pollIntervalMs !== "number" || !Number.isInteger(value.task.pollIntervalMs) || value.task.pollIntervalMs < 100 || value.task.pollIntervalMs > 10_000)) return false;
  }
  return true;
}

function pathParts(path: string): string[] {
  if (path === "$") return [];
  return path.replace(/^\$\.?/, "").split(".");
}

function readPath(value: unknown, path: string): unknown {
  let current = value;
  if (path === "$") return current;
  for (const part of pathParts(path)) {
    if (Array.isArray(current) && /^\d+$/.test(part)) current = current[Number(part)];
    else if (isPlainObject(current)) current = current[part];
    else return undefined;
  }
  return current;
}

function writePath(target: Record<string, unknown>, path: string, value: unknown): void {
  const parts = pathParts(path);
  let current = target;
  for (const part of parts.slice(0, -1)) {
    const next = current[part];
    if (!isPlainObject(next)) current[part] = {};
    current = current[part] as Record<string, unknown>;
  }
  current[parts.at(-1)!] = value;
}

export function buildImageProtocolRequest(
  config: ImageProtocolConfig,
  input: Record<string, unknown>,
): { endpoint: string; body: Record<string, unknown> } {
  const body: Record<string, unknown> = {};
  for (const [targetPath, mapping] of Object.entries(config.request)) {
    let value = "from" in mapping ? readPath(input, mapping.from) ?? mapping.default : mapping.value;
    if ("from" in mapping && mapping.map && value !== undefined && value !== null) {
      value = Object.hasOwn(mapping.map, String(value)) ? mapping.map[String(value)] : value;
    }
    if (value !== undefined) writePath(body, targetPath, value);
  }
  return { endpoint: config.endpoint, body };
}

export function normalizeImageProtocolResponse(config: ImageProtocolConfig, value: unknown): Record<string, unknown> {
  const images = readPath(value, config.response.imagesPath);
  if (!Array.isArray(images) || images.length === 0) throw new Error("Configured image list was not found in the upstream response.");
  const data = images.map((image) => {
    const result: Record<string, unknown> = {};
    const url = config.response.urlPath ? readPath(image, config.response.urlPath) : undefined;
    const base64 = config.response.base64Path ? readPath(image, config.response.base64Path) : undefined;
    const revisedPrompt = config.response.revisedPromptPath ? readPath(image, config.response.revisedPromptPath) : undefined;
    if (typeof url === "string" && url) result.url = url;
    if (typeof base64 === "string" && base64) result.b64_json = base64;
    if (typeof revisedPrompt === "string") result.revised_prompt = revisedPrompt;
    if (typeof result.url !== "string" && typeof result.b64_json !== "string") throw new Error("Configured image item did not contain a URL or base64 image.");
    return result;
  });
  const created = isPlainObject(value) && typeof value.created === "number" ? value.created : Math.floor(Date.now() / 1000);
  return { created, data };
}

export function imageTaskId(config: ImageProtocolConfig, value: unknown): string {
  if (!config.task) throw new Error("Image task polling is not configured.");
  const id = readPath(value, config.task.idPath);
  if (typeof id !== "string" || !id.trim() || id.length > 500) throw new Error("Configured image task id was not found in the upstream response.");
  return id;
}

export function imageTaskStatus(config: ImageProtocolConfig, value: unknown): string {
  if (!config.task) throw new Error("Image task polling is not configured.");
  const status = readPath(value, config.task.statusPath);
  if (typeof status !== "string" || !status.trim()) throw new Error("Configured image task status was not found in the upstream response.");
  return status;
}

export function imageTaskResult(config: ImageProtocolConfig, value: unknown): Record<string, unknown> {
  if (!config.task) throw new Error("Image task polling is not configured.");
  const images = readPath(value, config.task.resultImagesPath);
  if (!Array.isArray(images)) throw new Error("Configured image task result was not found in the upstream response.");
  const root: Record<string, unknown> = {};
  writePath(root, config.response.imagesPath, images);
  return root;
}

export function imageTaskStatusEndpoint(config: ImageProtocolConfig, taskId: string): string {
  if (!config.task) throw new Error("Image task polling is not configured.");
  return config.task.statusEndpoint.replace("{task_id}", encodeURIComponent(taskId));
}
