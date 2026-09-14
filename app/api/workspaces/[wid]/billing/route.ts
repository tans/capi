import { authResponse, requireUser } from "@/lib/auth";
import { getDatabase } from "@/lib/relay/store";
import { requireWorkspacePermission } from "@/lib/workspaces/permissions";

export async function GET(request: Request, { params }: { params: Promise<{ wid: string }> }) {
  return authResponse(async () => {
    const user = await requireUser(request);
    const id = Number((await params).wid);
    if (!Number.isInteger(id) || id <= 0) return Response.json({ error: "invalid workspace id" }, { status: 400 });
    await requireWorkspacePermission(user.id, id, "read");
    const db = await getDatabase();
    const wallet = db.query<{ balance_units: number; reserved_units: number; currency: string }, [number]>(
      "SELECT balance_units, reserved_units, currency FROM wallets WHERE workspace_id = ?",
    ).get(id);
    if (!wallet) return Response.json({ error: "wallet not found" }, { status: 404 });
    return Response.json({ currency: wallet.currency, balance_units: wallet.balance_units, reserved_units: wallet.reserved_units, available_units: wallet.balance_units - wallet.reserved_units });
  });
}
