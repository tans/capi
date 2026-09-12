import { authenticateKey, getRegistry } from "@/lib/relay";

/** Video generation is not supported by the configured relay implementation. */
export async function POST(request: Request) {
  const registry = await getRegistry();
  const auth = authenticateKey(registry, request, "video.generate");
  if (!auth.ok) return auth.response;

  return Response.json(
    {
      error: {
        type: "api_error",
        code: "unsupported_operation",
        message: "Kling video generation is not supported by this relay.",
        param: null,
      },
    },
    { status: 501 },
  );
}
