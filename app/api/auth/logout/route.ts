import { authResponse, clearSessionCookie, requireSameOrigin, revokeSession } from "@/lib/auth";

export async function POST(request: Request) {
  return authResponse(async () => {
    requireSameOrigin(request);
    await revokeSession(request);
    return Response.json({ success: true }, { headers: { "set-cookie": clearSessionCookie(), "cache-control": "no-store" } });
  });
}
