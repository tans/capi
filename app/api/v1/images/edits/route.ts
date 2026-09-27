import {
  authenticateKey,
  getRegistry,
  newRequestId,
  relayErrorResponse,
  relayImageGeneration,
} from "@/lib/relay";
import { MAX_MEDIA_FILE_BYTES, normalizeMediaType, parseMultipartFormData, PayloadTooLargeError, readImageReference, readRequestBytesLimited } from "@/lib/relay/files";

type EditFile = { image: Uint8Array; mimeType: string; filename: string };

function isFile(value: FormDataEntryValue | null): value is File {
  return !!value && typeof value !== "string" && typeof value.arrayBuffer === "function";
}

function errorResponse(message: string, status = 400) {
  return Response.json({ error: { type: "invalid_request_error", code: "invalid_image_input", message } }, { status });
}

export async function POST(request: Request) {
  const registry = await getRegistry();
  const auth = await authenticateKey(registry, request, "image.generate");
  if (!auth.ok) return auth.response;
  const declaredLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_MEDIA_FILE_BYTES + 64 * 1024) {
    return errorResponse("Image edit request must not exceed 25 MiB.", 413);
  }

  let body: Record<string, unknown>;
  let editFiles: EditFile[] = [];
  let maskFile: EditFile | undefined;
  try {
    if (request.headers.get("content-type")?.toLowerCase().includes("multipart/form-data")) {
      const form = await parseMultipartFormData(request, MAX_MEDIA_FILE_BYTES + 64 * 1024);
      body = Object.fromEntries([...form.entries()].filter(([key, value]) => key !== "image" && key !== "image[]" && key !== "mask" && typeof value === "string"));
      const files = [...form.getAll("image"), ...form.getAll("image[]")];
      if (files.length > 10 || files.some((file) => !isFile(file))) return errorResponse("Provide between 1 and 10 image files.");
      editFiles = await Promise.all(files.map(async (entry) => {
        const file = entry as File;
        const mimeType = normalizeMediaType(file.type);
        if (!mimeType?.startsWith("image/")) throw new Error("Only PNG, JPEG, WebP, or GIF images are supported.");
        if (!file.size || file.size > MAX_MEDIA_FILE_BYTES) throw new Error("Each image must be between 1 byte and 25 MiB.");
        return { image: new Uint8Array(await file.arrayBuffer()), mimeType, filename: file.name || "image" };
      }));
      const mask = form.get("mask");
      if (mask !== null) {
        if (!isFile(mask)) throw new Error("mask must be an image file.");
        const mimeType = normalizeMediaType(mask.type);
        if (!mimeType?.startsWith("image/")) throw new Error("Mask must be a PNG, JPEG, WebP, or GIF image.");
        if (!mask.size || mask.size > MAX_MEDIA_FILE_BYTES) throw new Error("Mask must be between 1 byte and 25 MiB.");
        maskFile = { image: new Uint8Array(await mask.arrayBuffer()), mimeType, filename: mask.name || "mask" };
      }
    } else {
      const parsed = JSON.parse((await readRequestBytesLimited(request, MAX_MEDIA_FILE_BYTES + 64 * 1024)).toString("utf8"));
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return errorResponse("Body must be a JSON object.");
      body = parsed as Record<string, unknown>;
      const values = body.image_urls ?? body.image_url ?? body.image;
      const references = Array.isArray(values) ? values : [values];
      if (references.some((value) => typeof value !== "string") || references.length > 10) return errorResponse("image_url must be a URL, file ID, or an array of up to 10 references.");
      editFiles = await Promise.all((references as string[]).filter(Boolean).map((value) => readImageReference(value, registry.database, auth.apiKey.workspaceId)));
      if (typeof body.mask_url === "string") {
        const mask = await readImageReference(body.mask_url, registry.database, auth.apiKey.workspaceId);
        maskFile = mask;
      }
    }
  } catch (error) {
    if (error instanceof PayloadTooLargeError) return errorResponse("Image edit request must not exceed 25 MiB.", 413);
    const message = error instanceof Error ? error.message : "Invalid image edit request.";
    return errorResponse(message, message.includes("25 MiB") || message.includes("25 Mi") ? 413 : 400);
  }
  if (editFiles.length === 0) return errorResponse("At least one image is required in image_url or image fields.");
  if (editFiles.reduce((total, file) => total + file.image.byteLength, maskFile?.image.byteLength ?? 0) > MAX_MEDIA_FILE_BYTES) {
    return errorResponse("Combined image and mask size must not exceed 25 MiB.", 413);
  }
  if (typeof body.model !== "string" || !body.model.trim()) return errorResponse("Missing required parameter: model.");
  if (typeof body.prompt !== "string" || !body.prompt.trim()) return errorResponse("Missing required parameter: prompt.");

  try {
    return await relayImageGeneration({
      registry,
      apiKey: auth.apiKey,
      pinnedChannelId: auth.pinnedChannelId,
      requestId: newRequestId(),
      body: body as Record<string, unknown> & { model: string; prompt: string },
      editFiles,
      maskFile,
    });
  } catch (error) {
    return relayErrorResponse(error, newRequestId());
  }
}
