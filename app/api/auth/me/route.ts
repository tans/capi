import { authResponse, requireUser } from "@/lib/auth";

export async function GET(request: Request) {
  return authResponse(async () => Response.json({ user: await requireUser(request) }, { headers: { "cache-control": "no-store" } }));
}
