/** Safe, declarative adapter for providers with JSON image-generation APIs. */
export type ImageInputField = string;

export type ImageValueMapping =
  | { from: ImageInputField; default?: string | number | boolean | null }
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

function validEndpoint(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 200 || !value.startsWith("/") || value.startsWith("//") || /[?#\\\u0000-\u001f]/.test(value)) return false;
  const parts = value.split("/");
  return parts.every((part) => part !== ".." && part !== ".") && !/%2e/i.test(value);
}

function validMapping(value: unknown): value is ImageValueMapping {
  if (!isPlainObject(value)) return false;
  const keys = Object.keys(value);
  if (keys.includes("from")) {
    return keys.every((key) => key === "from" || key === "default")
      && typeof value.from === "string"
      && validDataPath(value.from)
      && (value.default === undefined || value.default === null || ["string", "number", "boolean"].includes(typeof value.default));
  }
  return keys.length === 1 && "value" in value
    && (value.value === null || ["string", "number", "boolean"].includes(typeof value.value));
}

export function validateImageProtocolConfig(value: unknown): value is ImageProtocolConfig {
  if (!isPlainObject(value) || Buffer.byteLength(JSON.stringify(value)) > CONFIG_MAX_BYTES) return false;
  if (Object.keys(value).some((key) => !["version", "endpoint", "auth", "request", "response"].includes(key))) return false;
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
  return typeof value.response.urlPath === "string" || typeof value.response.base64Path === "string";
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
    const value = "from" in mapping ? readPath(input, mapping.from) ?? mapping.default : mapping.value;
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
