import { authResponse, resetPassword } from "@/lib/auth";

export async function POST(request: Request) {
  return authResponse(async () => resetPassword(request));
}
