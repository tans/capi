import { authResponse, register } from "@/lib/auth";

export async function POST(request: Request) {
  return authResponse(() => register(request));
}
