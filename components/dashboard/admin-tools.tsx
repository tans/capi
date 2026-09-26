"use client";

import * as React from "react";
import { Plus, Search, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
type User = { id: number; email: string; name: string; role: "user" | "admin"; created_at: number; last_used_at: number | null; balance: number; spent: number; currency: string };
type Code = { id: number; code: string; amount: number; currency?: string; redeemed_by: number | null; redeemed_at: number | null; expires_at: number | null; redeemed_by_email: string | null; redeemed_by_name: string | null; workspace_id: number | null; workspace_name: string | null; status: "available" | "expired" | "redeemed" };
type PricingTables = { inputPrice: Record<string, number>; outputPrice: Record<string, number>; cacheInputPrice: Record<string, number>; modelPrice: Record<string, number> };
type PricingRow = { id: string; model: string; input: string; output: string; cacheInput: string; perCall: string };
type Section = "users" | "pricing" | "codes";

const emptyPricing: PricingTables = { inputPrice: {}, outputPrice: {}, cacheInputPrice: {}, modelPrice: {} };
function pricingRows(tables: PricingTables): PricingRow[] {
  const names = new Set([...Object.keys(tables.inputPrice), ...Object.keys(tables.outputPrice), ...Object.keys(tables.cacheInputPrice), ...Object.keys(tables.modelPrice)]);
  return [...names].sort().map((model) => ({ id: model, model, input: tables.inputPrice[model] === undefined ? "" : String(tables.inputPrice[model]), output: tables.outputPrice[model] === undefined ? "" : String(tables.outputPrice[model]), cacheInput: tables.cacheInputPrice[model] === undefined ? "" : String(tables.cacheInputPrice[model]), perCall: tables.modelPrice[model] === undefined ? "" : String(tables.modelPrice[model]) }));
}

export function AdminTools({ locale, section }: { locale: "zh" | "en"; section: Section }) {
  const t = React.useCallback((en: string, cn: string) => locale === "zh" ? cn : en, [locale]);
  const [users, setUsers] = React.useState<User[]>([]);
  const [codes, setCodes] = React.useState<Code[]>([]);
  const [pricingRowsState, setPricingRowsState] = React.useState<PricingRow[]>([]);
  const [pricingSearch, setPricingSearch] = React.useState("");
  const [pricingSaving, setPricingSaving] = React.useState(false);
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
      if (section === "pricing") setPricingRowsState(pricingRows({ ...emptyPricing, ...result }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setLoading(false);
    }
  }, [section, t]);

  React.useEffect(() => { queueMicrotask(() => void load()); }, [load]);

  async function savePricing(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(""); setError("");
    const tables: PricingTables = { ...emptyPricing };
    const seen = new Set<string>();
    for (const [index, row] of pricingRowsState.entries()) {
      const model = row.model.trim();
      if (!model) { setError(t(`Row ${index + 1}: enter a model name.`, `第 ${index + 1} 行：请填写模型名称。`)); return; }
      if (seen.has(model)) { setError(t(`Row ${index + 1}: model names must be unique.`, `第 ${index + 1} 行：模型名称不能重复。`)); return; }
      seen.add(model);
      const values = [row.input, row.output, row.cacheInput, row.perCall];
      if (values.some((value) => value !== "" && (!Number.isFinite(Number(value)) || Number(value) < 0))) { setError(t(`Row ${index + 1}: prices must be zero or greater.`, `第 ${index + 1} 行：价格必须是大于或等于 0 的数字。`)); return; }
      if (row.perCall !== "") {
        if (row.input !== "" || row.output !== "" || row.cacheInput !== "") { setError(t(`Row ${index + 1}: per-call pricing cannot be combined with token prices.`, `第 ${index + 1} 行：按次计费不能同时填写 token 单价。`)); return; }
        tables.modelPrice[model] = Number(row.perCall);
      } else {
        if (row.input === "" || row.output === "") { setError(t(`Row ${index + 1}: enter both input and output prices, or set a per-call price.`, `第 ${index + 1} 行：请同时填写输入和输出价格，或改为填写按次价格。`)); return; }
        tables.inputPrice[model] = Number(row.input); tables.outputPrice[model] = Number(row.output);
        if (row.cacheInput !== "") tables.cacheInputPrice[model] = Number(row.cacheInput);
      }
    }
    setPricingSaving(true);
    try {
      const response = await fetch("/api/admin/pricing", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(tables) });
      const result = await response.json().catch(() => null);
      if (!response.ok) throw new Error(result?.error?.message || result?.error || t("Unable to save pricing.", "收费配置保存失败。"));
      setMessage(t("Pricing saved.", "价格配置已保存。"));
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setPricingSaving(false); }
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
  const visiblePricingRows = pricingRowsState.filter((row) => row.model.toLowerCase().includes(pricingSearch.trim().toLowerCase()));
  function updatePricingRow(id: string, patch: Partial<PricingRow>) {
    setPricingRowsState((rows) => rows.map((row) => row.id === id ? { ...row, ...patch } : row));
  }

  return <section className="flex flex-col gap-5">
    <div><h1 className="text-[22px] font-semibold tracking-tight">{t(titleEn, titleZh)}</h1><p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">{t("Administration tools", "管理员工具")}</p></div>
    {error && <div role="alert" className="rounded-md border border-destructive/30 bg-card p-4 text-sm text-destructive">{error}</div>}
    {message && <p role="status" className="text-sm text-muted-foreground">{message}</p>}
    {loading && <p role="status" className="py-3 text-sm text-muted-foreground">{t("Loading…", "正在加载…")}</p>}
    {!loading && section === "users" && <div className="overflow-x-auto rounded-md border border-border bg-card"><table className="w-full text-sm"><thead><tr className="border-b text-left"><th className="p-3">{t("User", "用户")}</th><th className="p-3 whitespace-nowrap">{t("Registered at", "注册时间")}</th><th className="p-3 whitespace-nowrap">{t("Last used", "最后使用时间")}</th><th className="p-3">{t("Role", "角色")}</th><th className="p-3">{t("Balance", "余额")}</th><th className="p-3">{t("Used", "已使用额度")}</th></tr></thead><tbody>{users.map((user) => <tr className="border-b last:border-0" key={user.id}><td className="p-3">{user.name}<br /><span className="text-xs text-muted-foreground">{user.email}</span></td><td className="p-3 whitespace-nowrap text-xs text-muted-foreground">{new Date(user.created_at).toLocaleString(locale === "zh" ? "zh-CN" : "en-US")}</td><td className="p-3 whitespace-nowrap text-xs text-muted-foreground">{user.last_used_at ? new Date(user.last_used_at).toLocaleString(locale === "zh" ? "zh-CN" : "en-US") : t("Never", "从未使用")}</td><td className="p-3"><select className="h-9 rounded-sm border border-input bg-background px-2" value={user.role} onChange={(event) => void updateUser(user, { role: event.target.value as User["role"] })}><option value="user">user</option><option value="admin">admin</option></select></td><td className="p-3"><Input aria-label={`${user.email} balance`} className="w-28" type="number" min="0" step="0.01" defaultValue={user.balance.toFixed(2)} onBlur={(event) => void updateUser(user, { balance: Number(event.target.value) })} /></td><td className="p-3 tabular-nums text-muted-foreground">{user.currency} {user.spent.toFixed(4)}</td></tr>)}</tbody></table></div>}
    {!loading && section === "pricing" && <form onSubmit={savePricing} className="space-y-4">
      <div className="space-y-3">
        <p className="max-w-3xl text-sm leading-6 text-muted-foreground">{t("Set prices in USD. Token prices are per 1 million tokens. Per-call pricing replaces token pricing for that model. Leave cache input blank to use the regular input price. Models without a row keep their current pricing rules.", "金额以美元填写。Token 单价按每 100 万 token 计算。按次价格会替代该模型的 token 计价。缓存输入价格留空时沿用普通输入价格。未添加的模型继续沿用当前计价规则。")}</p>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <label className="relative block w-full sm:max-w-xs"><Search aria-hidden="true" className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input aria-label={t("Search models", "搜索模型")} value={pricingSearch} onChange={(event) => setPricingSearch(event.target.value)} placeholder={t("Search models", "搜索模型")} className="pl-9" /></label>
          <Button type="button" variant="outline" size="sm" onClick={() => setPricingRowsState((rows) => [...rows, { id: `new-${Date.now()}-${Math.random()}`, model: "", input: "", output: "", cacheInput: "", perCall: "" }])}><Plus aria-hidden="true" />{t("Add model", "添加模型")}</Button>
        </div>
      </div>
      <div className="overflow-x-auto rounded-md border border-border bg-card">
        <table className="table table-sm min-w-[850px]">
          <thead><tr><th>{t("Model", "模型")}</th><th>{t("Input · USD / 1M tokens", "输入 · 美元 / 百万 token")}</th><th>{t("Output · USD / 1M tokens", "输出 · 美元 / 百万 token")}</th><th>{t("Cached input · optional", "缓存输入 · 可选")}</th><th>{t("Per call · USD", "按次 · 美元")}</th><th><span className="sr-only">{t("Actions", "操作")}</span></th></tr></thead>
          <tbody>{visiblePricingRows.map((row) => <tr key={row.id}>
            <td><Input aria-label={t("Model name", "模型名称")} required value={row.model} onChange={(event) => updatePricingRow(row.id, { model: event.target.value })} placeholder="gpt-5.6" className="min-w-36" /></td>
            {(["input", "output", "cacheInput", "perCall"] as const).map((field) => <td key={field}><Input aria-label={field === "input" ? t("Input price per million tokens", "输入单价（每百万 token）") : field === "output" ? t("Output price per million tokens", "输出单价（每百万 token）") : field === "cacheInput" ? t("Cached input price per million tokens", "缓存输入单价（每百万 token）") : t("Per-call price", "按次价格")} type="number" min="0" step="any" value={row[field]} onChange={(event) => updatePricingRow(row.id, { [field]: event.target.value })} placeholder={field === "cacheInput" || field === "perCall" ? "—" : "0.00"} className="min-w-32 tabular-nums" /></td>)}
            <td><Button type="button" variant="ghost" size="sm" aria-label={t(`Remove ${row.model || "model row"}`, `删除${row.model || "模型行"}`)} onClick={() => setPricingRowsState((rows) => rows.filter((item) => item.id !== row.id))}><Trash2 aria-hidden="true" className="size-4" /></Button></td>
          </tr>)}
          {visiblePricingRows.length === 0 && <tr><td colSpan={6} className="py-8 text-center text-sm text-muted-foreground">{pricingRowsState.length ? t("No models match this search.", "没有符合搜索条件的模型。") : t("No custom prices yet. Add a model to override its current pricing.", "还没有自定义价格。添加模型即可覆盖其当前价格。")}</td></tr>}</tbody>
        </table>
      </div>
      <div className="flex justify-end"><Button type="submit" disabled={pricingSaving}>{pricingSaving ? t("Saving…", "保存中…") : t("Save pricing", "保存价格")}</Button></div>
    </form>}
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
