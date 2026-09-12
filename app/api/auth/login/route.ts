import { authResponse, login } from "@/lib/auth";

export async function POST(request: Request) {
  return authResponse(() => login(request));
}
