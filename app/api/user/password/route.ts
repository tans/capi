import { authResponse, changePassword } from "@/lib/auth";

export async function PUT(request: Request) {
  return authResponse(async () => (await changePassword(request)));
}
