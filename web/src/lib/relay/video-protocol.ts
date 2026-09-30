/** Safe, declarative adapter for asynchronous JSON video-generation APIs. */
export type VideoValueMapping =
  | { from: string; default?: string | number | boolean | null }
  | { value: string | number | boolean | null };

export type VideoProtocolConfig = {
  version: 1;
  auth?: { type: "bearer" } | { type: "api-key-header"; header: string };
  submit: { endpoint: string; request: Record<string, VideoValueMapping> };
  taskIdPath: string;
  poll: {
    endpoint: string;
    statusPath: string;
    resultUrlPath: string;
    errorPath?: string;
    successStatuses?: string[];
    failureStatuses?: string[];
  };
  requiredInput?: string[];
};

const SAFE_PATH_PART = /^[A-Za-z0-9_-]+$/;
const RESERVED_KEYS = new Set(["__proto__", "prototype", "constructor"]);
const MAX_CONFIG_BYTES = 24_000;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function validDataPath(value: unknown): value is string {
  if (typeof value !== "string" || !value.trim() || value.length > 200) return false;
  return value.trim().split(".").every((part) => (SAFE_PATH_PART.test(part) || /^\d{1,2}$/.test(part)) && !RESERVED_KEYS.has(part));
}

function validEndpoint(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 300 || !value.startsWith("/") || value.startsWith("//") || /[\\\u0000-\u001f#]/.test(value)) return false;
  const parts = value.split("?");
  if (parts.length > 2) return false;
  const [path, query] = parts;
  if (path.split("/").some((part) => part === ".." || part === ".") || /%2e/i.test(path)) return false;
  if (/[{}]/.test(path.replace(/\{(?:model|id)\}/g, ""))) return false;
  if (query !== undefined && (!query || !query.split("&").every((pair) => {
    const separator = pair.indexOf("=");
    if (separator < 1 || pair.indexOf("=", separator + 1) >= 0) return false;
    const key = pair.slice(0, separator);
    const queryValue = pair.slice(separator + 1);
    return /^[A-Za-z0-9_-]{1,80}$/.test(key)
      && queryValue.length <= 200
      && !/[{}]/.test(queryValue.replace(/\{(?:model|id)\}/g, ""))
      && !/[\s\\]/.test(queryValue);
  }))) return false;
  return true;
}

function validMapping(value: unknown): value is VideoValueMapping {
  if (!isPlainObject(value)) return false;
  const keys = Object.keys(value);
  if (keys.includes("from")) {
    return keys.every((key) => key === "from" || key === "default")
      && validDataPath(value.from)
      && (value.default === undefined || value.default === null || ["string", "number", "boolean"].includes(typeof value.default));
  }
  return keys.length === 1 && "value" in value
    && (value.value === null || ["string", "number", "boolean"].includes(typeof value.value));
}

export function validateVideoProtocolConfig(value: unknown): value is VideoProtocolConfig {
  if (!isPlainObject(value) || Buffer.byteLength(JSON.stringify(value)) > MAX_CONFIG_BYTES) return false;
  if (Object.keys(value).some((key) => !["version", "auth", "submit", "taskIdPath", "poll", "requiredInput"].includes(key))) return false;
  if (value.version !== 1 || !isPlainObject(value.submit) || !isPlainObject(value.poll)) return false;
  if (Object.keys(value.submit).some((key) => !["endpoint", "request"].includes(key))
    || !validEndpoint(value.submit.endpoint) || !isPlainObject(value.submit.request)) return false;
  const request = value.submit.request;
  if (Object.keys(request).length < 2 || Object.keys(request).length > 100) return false;
  let hasModel = value.submit.endpoint.includes("{model}");
  let hasPrompt = false;
  const paths = Object.keys(request);
  for (const [path, mapping] of Object.entries(request)) {
    if (!validDataPath(path) || !validMapping(mapping)) return false;
    if ("from" in mapping) {
      if (mapping.from === "model") hasModel = true;
      if (mapping.from === "prompt") hasPrompt = true;
    }
  }
  if (!hasModel || !hasPrompt || paths.some((path, i) => paths.some((other, j) => i !== j && other.startsWith(`${path}.`)))) return false;
  if (!validDataPath(value.taskIdPath)) return false;
  if (Object.keys(value.poll).some((key) => !["endpoint", "statusPath", "resultUrlPath", "errorPath", "successStatuses", "failureStatuses"].includes(key))
    || !validEndpoint(value.poll.endpoint) || !validDataPath(value.poll.statusPath) || !validDataPath(value.poll.resultUrlPath)
    || (value.poll.errorPath !== undefined && !validDataPath(value.poll.errorPath))) return false;
  for (const statuses of [value.poll.successStatuses, value.poll.failureStatuses]) {
    if (statuses !== undefined && (!Array.isArray(statuses) || statuses.length === 0 || statuses.length > 20 || !statuses.every((item) => typeof item === "string" && item.length <= 40))) return false;
  }
  if (value.requiredInput !== undefined && (!Array.isArray(value.requiredInput) || value.requiredInput.length > 32 || !value.requiredInput.every(validDataPath))) return false;
  if (value.auth !== undefined) {
    if (!isPlainObject(value.auth)) return false;
    if (value.auth.type === "bearer") {
      if (Object.keys(value.auth).some((key) => key !== "type")) return false;
    } else if (value.auth.type === "api-key-header") {
      if (Object.keys(value.auth).some((key) => key !== "type" && key !== "header")
        || typeof value.auth.header !== "string"
        || !/^[!#$%&'*+.^_`|~0-9A-Za-z-]{1,80}$/.test(value.auth.header)
        || ["host", "content-length", "cookie"].includes(value.auth.header.toLowerCase())) return false;
    } else return false;
  }
  return true;
}

function readPath(value: unknown, path: string): unknown {
  let current = value;
  for (const part of path.split(".")) {
    if (Array.isArray(current) && /^\d+$/.test(part)) current = current[Number(part)];
    else if (isPlainObject(current)) current = current[part];
    else return undefined;
  }
  return current;
}

function writePath(target: Record<string, unknown>, path: string, value: unknown): void {
  const parts = path.split(".");
  let current: Record<string, unknown> | unknown[] = target;
  for (let i = 0; i < parts.length - 1; i += 1) {
    const part = parts[i]!;
    const nextPart = parts[i + 1]!;
    const array = /^\d+$/.test(nextPart);
    let next: unknown;
    if (Array.isArray(current)) {
      const index = Number(part);
      next = current[index];
      if (!next || typeof next !== "object") current[index] = array ? [] : {};
      current = current[index] as Record<string, unknown> | unknown[];
    } else {
      next = current[part];
      if (!next || typeof next !== "object") current[part] = array ? [] : {};
      current = current[part] as Record<string, unknown> | unknown[];
    }
  }
  const finalPart = parts.at(-1)!;
  if (Array.isArray(current) && /^\d+$/.test(finalPart)) current[Number(finalPart)] = value;
  else (current as Record<string, unknown>)[finalPart] = value;
}

export function buildVideoSubmit(config: VideoProtocolConfig, input: Record<string, unknown>): { endpoint: string; body: Record<string, unknown> } {
  const body: Record<string, unknown> = {};
  for (const [targetPath, mapping] of Object.entries(config.submit.request)) {
    const value = "from" in mapping ? readPath(input, mapping.from) ?? mapping.default : mapping.value;
    if (value !== undefined) writePath(body, targetPath, value);
  }
  const endpoint = config.submit.endpoint.replace(/\{(model|id)\}/g, (_match, name: string) => encodeURIComponent(String(input[name === "model" ? "model" : "upstreamTaskId"] ?? "")));
  return { endpoint, body };
}

export function buildVideoStatusEndpoint(config: VideoProtocolConfig, upstreamTaskId: string): string {
  return config.poll.endpoint.replace(/\{(model|id)\}/g, (_match, name: string) => encodeURIComponent(name === "id" ? upstreamTaskId : ""));
}

export function readVideoPath(value: unknown, path: string): unknown {
  return readPath(value, path);
}
