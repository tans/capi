import { authResponse, sendPasswordResetCode } from "@/lib/auth";

export async function POST(request: Request) {
  return authResponse(async () => sendPasswordResetCode(request));
}
