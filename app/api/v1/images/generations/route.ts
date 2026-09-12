import { authenticateKey, getRegistry } from "@/lib/relay";

/** Image generation is not supported by the configured relay implementation. */
export async function POST(request: Request) {
  const registry = await getRegistry();
  const auth = authenticateKey(registry, request, "image.generate");
  if (!auth.ok) return auth.response;

  return Response.json(
    {
      error: {
        type: "api_error",
        code: "unsupported_operation",
        message: "Image generation is not supported by this relay.",
        param: null,
      },
    },
    { status: 501 },
  );
}
