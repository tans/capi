import { authenticateKey, getRegistry } from "@/lib/relay";

/** Task polling is unavailable until an asynchronous upstream is supported. */
export async function GET(request: Request) {
  const registry = await getRegistry();
  const auth = authenticateKey(registry, request, "video.generate");
  if (!auth.ok) return auth.response;

  return Response.json(
    {
      error: {
        type: "api_error",
        code: "unsupported_operation",
        message: "Asynchronous task polling is not supported by this relay.",
        param: null,
      },
    },
    { status: 501, headers: { "cache-control": "no-store" } },
  );
}
