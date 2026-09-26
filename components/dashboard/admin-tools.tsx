"use client";

import * as React from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
type User = { id: number; email: string; name: string; role: "user" | "admin"; created_at: number; last_used_at: number | null; balance: number; spent: number; currency: string };
type Code = { id: number; code: string; amount: number; currency?: string; redeemed_by: number | null; redeemed_at: number | null; expires_at: number | null; redeemed_by_email: string | null; redeemed_by_name: string | null; workspace_id: number | null; workspace_name: string | null; status: "available" | "expired" | "redeemed" };
type Tables = { modelRatio: Record<string, number>; completionRatio: Record<string, number>; modelPrice: Record<string, number> };
type Section = "users" | "pricing" | "codes";

function parseLines(value: string): Record<string, number> {
  const result: Record<string, number> = {};
  for (const line of value.split(/\n/).map((entry) => entry.trim()).filter(Boolean)) {
    const separator = line.indexOf("=");
    const name = line.slice(0, separator).trim();
    const amount = Number(line.slice(separator + 1).trim());
    if (separator > 0 && Number.isFinite(amount) && amount >= 0) result[name] = amount;
  }
  return result;
}
function formatLines(table: Record<string, number> | null | undefined) {
  return Object.entries(table ?? {}).map(([name, value]) => `${name}=${value}`).join("\n");
}

export function AdminTools({ locale, section }: { locale: "zh" | "en"; section: Section }) {
  const t = React.useCallback((en: string, cn: string) => locale === "zh" ? cn : en, [locale]);
  const [users, setUsers] = React.useState<User[]>([]);
  const [codes, setCodes] = React.useState<Code[]>([]);
  const [pricing, setPricing] = React.useState<Tables>({ modelRatio: {}, completionRatio: {}, modelPrice: {} });
  const [amount, setAmount] = React.useState("10");
  const [expiresAt, setExpiresAt] = React.useState("");
  const [message, setMessage] = React.useState("");
  const [error, setError] = React.useState("");
  const [loading, setLoading] = React.useState(true);
  const [creating, setCreating] = React.useState(false);
  const [createDialogOpen, setCreateDialogOpen] = React.useState(false);
  const [createError, setCreateError] = React.useState("");

  const load = React.useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/admin/${section === "codes" ? "redeem-codes" : section}`, { cache: "no-store" });
      const result = await response.json().catch(() => null);
      if (!response.ok) throw new Error(result?.error?.message || t("Unable to load this section.", "无法加载此栏目。"));
      if (section === "users") setUsers(result.data);
      if (section === "codes") setCodes(result.data);
      if (section === "pricing") setPricing(result);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setLoading(false);
    }
  }, [section, t]);

  React.useEffect(() => { queueMicrotask(() => void load()); }, [load]);

  async function savePricing(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/admin/pricing", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ modelRatio: parseLines(String(form.get("modelRatio"))), completionRatio: parseLines(String(form.get("completionRatio"))), modelPrice: parseLines(String(form.get("modelPrice"))) }) });
    setMessage(response.ok ? t("Pricing saved.", "收费配置已保存。") : t("Unable to save pricing.", "收费配置保存失败。"));
  }
  async function createCode(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (creating) return;
    setCreating(true); setMessage(""); setError(""); setCreateError("");
    try {
      const response = await fetch("/api/admin/redeem-codes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ amount: Number(amount), expiresAt: expiresAt ? new Date(expiresAt).getTime() : null }) });
      const result = await response.json().catch(() => null);
      if (!response.ok) throw new Error(result?.error?.message || result?.error || t("Unable to create code.", "兑换码创建失败。"));
      setMessage(`${t("Created code", "兑换码已创建")}: ${result.code}`); setAmount("10"); setExpiresAt(""); setCreateDialogOpen(false); void load();
    } catch (cause) { setCreateError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setCreating(false); }
  }

  async function updateUser(user: User, patch: Partial<User>) {
    const response = await fetch(`/api/admin/users/${user.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) });
    setMessage(response.ok ? t("User updated.", "用户已更新。") : t("Unable to update user.", "用户更新失败。"));
    if (response.ok) void load();
  }

  const titles: Record<Section, [string, string]> = {
    users: ["Users", "用户"], pricing: ["Model pricing", "模型收费"], codes: ["Redeem codes", "兑换码"],
  };
  const [titleEn, titleZh] = titles[section];

  return <section className="flex flex-col gap-5">
    <div><h1 className="text-[22px] font-semibold tracking-tight">{t(titleEn, titleZh)}</h1><p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">{t("Administration tools", "管理员工具")}</p></div>
    {error && <div role="alert" className="rounded-md border border-destructive/30 bg-card p-4 text-sm text-destructive">{error}</div>}
    {message && <p role="status" className="text-sm text-muted-foreground">{message}</p>}
    {loading && <p role="status" className="py-3 text-sm text-muted-foreground">{t("Loading…", "正在加载…")}</p>}
    {!loading && section === "users" && <div className="overflow-x-auto rounded-md border border-border bg-card"><table className="w-full text-sm"><thead><tr className="border-b text-left"><th className="p-3">{t("User", "用户")}</th><th className="p-3 whitespace-nowrap">{t("Registered at", "注册时间")}</th><th className="p-3 whitespace-nowrap">{t("Last used", "最后使用时间")}</th><th className="p-3">{t("Role", "角色")}</th><th className="p-3">{t("Balance", "余额")}</th><th className="p-3">{t("Used", "已使用额度")}</th></tr></thead><tbody>{users.map((user) => <tr className="border-b last:border-0" key={user.id}><td className="p-3">{user.name}<br /><span className="text-xs text-muted-foreground">{user.email}</span></td><td className="p-3 whitespace-nowrap text-xs text-muted-foreground">{new Date(user.created_at).toLocaleString(locale === "zh" ? "zh-CN" : "en-US")}</td><td className="p-3 whitespace-nowrap text-xs text-muted-foreground">{user.last_used_at ? new Date(user.last_used_at).toLocaleString(locale === "zh" ? "zh-CN" : "en-US") : t("Never", "从未使用")}</td><td className="p-3"><select className="h-9 rounded-sm border border-input bg-background px-2" value={user.role} onChange={(event) => void updateUser(user, { role: event.target.value as User["role"] })}><option value="user">user</option><option value="admin">admin</option></select></td><td className="p-3"><Input aria-label={`${user.email} balance`} className="w-28" type="number" min="0" step="0.01" defaultValue={user.balance.toFixed(2)} onBlur={(event) => void updateUser(user, { balance: Number(event.target.value) })} /></td><td className="p-3 tabular-nums text-muted-foreground">{user.currency} {user.spent.toFixed(4)}</td></tr>)}</tbody></table></div>}
    {!loading && section === "pricing" && <form onSubmit={savePricing} className="grid gap-4 rounded-md border border-border bg-card p-5"><label>{t("Input ratio (model=value)", "输入倍率（模型=数值）")}<textarea name="modelRatio" defaultValue={formatLines(pricing.modelRatio)} className="mt-2 min-h-32 w-full rounded-md border border-input bg-background p-3 font-mono text-sm" placeholder="gpt-5=1" /></label><label>{t("Output ratio", "输出倍率")}<textarea name="completionRatio" defaultValue={formatLines(pricing.completionRatio)} className="mt-2 min-h-24 w-full rounded-md border border-input bg-background p-3 font-mono text-sm" placeholder="gpt-5=2" /></label><label>{t("Per-call price in USD", "按次价格（美元）")}<textarea name="modelPrice" defaultValue={formatLines(pricing.modelPrice)} className="mt-2 min-h-24 w-full rounded-md border border-input bg-background p-3 font-mono text-sm" placeholder="image-model=0.02" /></label><Button type="submit" className="w-fit">{t("Save pricing", "保存收费")}</Button></form>}
    {!loading && section === "codes" && <>
      <div className="flex justify-end">
        <Dialog open={createDialogOpen} onOpenChange={(open) => { if (!creating) { setCreateDialogOpen(open); if (open) setCreateError(""); } }}>
          <DialogTrigger asChild>
            <Button><Plus aria-hidden="true" />{t("Create code", "创建兑换码")}</Button>
          </DialogTrigger>
          <DialogContent closeLabel={t("Close", "关闭")}>
            <DialogHeader>
              <DialogTitle>{t("Create redeem code", "创建兑换码")}</DialogTitle>
              <DialogDescription>{t("Set the credit amount and an optional expiration date.", "设置兑换金额和可选的有效期。")}</DialogDescription>
            </DialogHeader>
            <form onSubmit={createCode} className="flex flex-col gap-4">
              <label className="form-control"><span className="label-text mb-2 text-sm">{t("Amount (system currency)", "金额（系统货币）")}</span><Input required autoFocus aria-label={t("Amount", "金额")} type="number" min="0.01" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} disabled={creating} /></label>
              <label className="form-control"><span className="label-text mb-2 text-sm">{t("Expires (optional)", "有效期（可选）")}</span><Input aria-label={t("Expires", "有效期")} type="datetime-local" value={expiresAt} onChange={(event) => setExpiresAt(event.target.value)} disabled={creating} /></label>
              {createError && <div role="alert" className="rounded-md border border-destructive/30 bg-card p-3 text-sm text-destructive">{createError}</div>}
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setCreateDialogOpen(false)} disabled={creating}>{t("Cancel", "取消")}</Button>
                <Button type="submit" disabled={creating}>{creating ? t("Creating…", "创建中…") : t("Create code", "创建兑换码")}</Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>
      <div className="overflow-x-auto rounded-box border border-border bg-card"><table className="w-full text-sm"><thead><tr className="border-b text-left"><th className="p-3">{t("Code", "兑换码")}</th><th className="p-3">{t("Amount", "金额")}</th><th className="p-3">{t("Status", "状态")}</th><th className="p-3">{t("Destination / redeemer", "到账空间 / 兑换人")}</th><th className="p-3">{t("Redeemed at", "兑换时间")}</th></tr></thead><tbody>{codes.map((code) => <tr className="border-b last:border-0" key={code.id}><td className="p-3 font-mono">{code.code}</td><td className="p-3">{code.currency ?? "USD"} {code.amount.toFixed(2)}</td><td className="p-3">{code.status === "redeemed" ? t("Redeemed", "已兑换") : code.status === "expired" ? t("Expired", "已过期") : t("Available", "可兑换")}</td><td className="p-3">{code.workspace_name || "—"}<br /><span className="text-xs text-muted-foreground">{code.redeemed_by_name || code.redeemed_by_email || "—"}</span></td><td className="p-3 text-muted-foreground">{code.redeemed_at ? new Date(code.redeemed_at).toLocaleString() : "—"}</td></tr>)}</tbody></table></div>
    </>}
  </section>;
}
