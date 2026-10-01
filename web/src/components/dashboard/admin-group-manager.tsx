import { useState, type FormEvent } from "react";
import { APIError, api, useResource } from "@/api";
import type { Locale } from "@/lib/i18n/config";

type Group = { id: string; name: string; displayName: string; ratio: number; description: string; status: 1 | 2; createdAt: number };
type Draft = { name: string; displayName: string; ratio: string; description: string; status: 1 | 2 };
const blank: Draft = { name: "", displayName: "", ratio: "1", description: "", status: 1 };

export function AdminGroupManager({ locale, isAdmin }: { locale: Locale; isAdmin: boolean }) {
  const resource = useResource<{ data: Group[] }>(isAdmin ? "/api/admin/groups" : null);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(blank);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const zh = locale === "zh";
  const copy = {
    title: zh ? "模型分组" : "Model groups",
    description: zh ? "管理 API 密钥可选的模型分组、启停状态与计费倍率。倍率会应用于平台渠道的预留和最终结算。" : "Manage API-key model groups, availability and billing ratios. Ratios apply to reservations and final charges for platform channels.",
    add: zh ? "新增分组" : "Add group", name: zh ? "分组标识" : "Group name", display: zh ? "显示名称" : "Display name", ratio: zh ? "计费倍率" : "Billing ratio", detail: zh ? "说明" : "Description", state: zh ? "状态" : "Status", enabled: zh ? "已启用" : "已禁用", save: zh ? "保存分组" : "Save group", cancel: zh ? "取消" : "Cancel", edit: zh ? "编辑" : "Edit", remove: zh ? "删除" : "Delete", saving: zh ? "保存中…" : "Saving…", empty: zh ? "还没有分组。新增分组后，渠道与 API 密钥可以按标识引用它。" : "No groups yet. Add a group for channels and API keys to reference.", saved: zh ? "分组已保存。" : "Group saved.", created: zh ? "分组已创建。" : "Group created.", deleted: zh ? "分组已删除，相关渠道和密钥已切换到默认分组。" : "Group deleted; its channel and key references now use the default group.", deleteConfirm: zh ? "删除此分组？引用它的渠道与密钥将切换到默认分组。" : "Delete this group? Channels and keys that reference it will use the default group.", loading: zh ? "正在加载分组…" : "Loading groups…", active: zh ? "启用" : "启用", disabled: zh ? "禁用" : "禁用",
  };
  const groups = resource.data?.data ?? [];
  const startCreate = () => { setEditing(null); setDraft(blank); setError(""); setNotice(""); };
  const startEdit = (group: Group) => { setEditing(group.name); setDraft({ name: group.name, displayName: group.displayName, ratio: String(group.ratio), description: group.description, status: group.status }); setError(""); setNotice(""); };
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy || !isAdmin) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const path = editing ? `/api/admin/groups/${encodeURIComponent(editing)}` : "/api/admin/groups";
      await api<Group>(path, { method: editing ? "PATCH" : "POST", body: JSON.stringify({ ...draft, ratio: Number(draft.ratio) }) });
      setEditing(null); setDraft(blank); setNotice(editing ? copy.saved : copy.created); window.dispatchEvent(new Event("capi:refresh"));
    } catch (cause) { setError(cause instanceof APIError ? cause.message : cause instanceof Error ? cause.message : (zh ? "保存失败。" : "Unable to save the group.")); }
    finally { setBusy(false); }
  };
  const remove = async (group: Group) => {
    if (!window.confirm(copy.deleteConfirm) || busy) return;
    setBusy(true); setError(""); setNotice("");
    try { await api(`/api/admin/groups/${encodeURIComponent(group.name)}`, { method: "DELETE" }); setNotice(copy.deleted); if (editing === group.name) startCreate(); window.dispatchEvent(new Event("capi:refresh")); }
    catch (cause) { setError(cause instanceof Error ? cause.message : (zh ? "删除失败。" : "Unable to delete the group.")); }
    finally { setBusy(false); }
  };
  if (!isAdmin) return <div role="alert" className="alert alert-error">{zh ? "需要管理员权限。" : "Administrator permission is required."}</div>;
  if (!resource.data) return <div className="py-8">{resource.loading ? <p role="status">{copy.loading}</p> : <div role="alert" className="alert alert-error">{resource.error?.message}</div>}</div>;
  return <div className="flex flex-col gap-6">
    <div className="flex flex-wrap items-start justify-between gap-4"><div><h1 className="text-[22px] font-semibold tracking-tight">{copy.title}</h1><p className="mt-1 max-w-3xl text-sm text-muted-foreground">{copy.description}</p></div><button type="button" className="btn" onClick={startCreate} disabled={busy}>{copy.add}</button></div>
    {(error || notice) && <div role={error ? "alert" : "status"} className={`alert ${error ? "alert-error" : "alert-success"}`}>{error || notice}</div>}
    <form className="card card-border bg-base-100" onSubmit={submit}><div className="card-body">
      <h2 className="card-title text-base">{editing ? `${copy.edit}: ${editing}` : copy.add}</h2>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-2"><span className="text-sm font-medium">{copy.name}</span><input className="input w-full font-mono" value={draft.name} onChange={event => setDraft(current => ({ ...current, name: event.target.value }))} maxLength={32} required disabled={busy || Boolean(editing)} autoComplete="off" /></label>
        <label className="flex flex-col gap-2"><span className="text-sm font-medium">{copy.display}</span><input className="input w-full" value={draft.displayName} onChange={event => setDraft(current => ({ ...current, displayName: event.target.value }))} maxLength={100} required disabled={busy} /></label>
        <label className="flex flex-col gap-2"><span className="text-sm font-medium">{copy.ratio}</span><input className="input w-full" type="number" min="0" max="1000" step="0.1" value={draft.ratio} onChange={event => setDraft(current => ({ ...current, ratio: event.target.value }))} required disabled={busy} /></label>
        <label className="flex flex-col gap-2"><span className="text-sm font-medium">{copy.state}</span><select className="select w-full" value={draft.status} onChange={event => setDraft(current => ({ ...current, status: event.target.value === "2" ? 2 : 1 }))} disabled={busy}><option value={1}>{zh ? "已启用" : "Enabled"}</option><option value={2}>{zh ? "已禁用" : "Disabled"}</option></select></label>
        <label className="flex flex-col gap-2 sm:col-span-2"><span className="text-sm font-medium">{copy.detail}</span><input className="input w-full" value={draft.description} onChange={event => setDraft(current => ({ ...current, description: event.target.value }))} maxLength={200} disabled={busy} /></label>
      </div>
      <p className="text-xs text-base-content/60">{zh ? "标识 1–32 个字母、数字、下划线、连字符或点；创建后不可更名。默认分组不可删除。" : "Use 1–32 letters, numbers, underscores, hyphens or dots. Names are immutable; the default group cannot be deleted."}</p>
      <div className="card-actions justify-end"><button className="btn btn-ghost" type="button" onClick={startCreate} disabled={busy}>{copy.cancel}</button><button className="btn btn-primary" type="submit" disabled={busy}>{busy ? copy.saving : copy.save}</button></div>
    </div></form>
    <section className="overflow-x-auto rounded-box border border-base-300 bg-base-100"><table className="table"><thead><tr><th>{copy.name}</th><th>{copy.display}</th><th>{copy.ratio}</th><th>{copy.state}</th><th>{copy.detail}</th><th><span className="sr-only">{copy.edit}</span></th></tr></thead><tbody>{groups.map(group => <tr key={group.id}><td className="font-mono">{group.name}</td><td>{group.displayName}</td><td className="tabular-nums">{group.ratio}</td><td><span className={`badge ${group.status === 1 ? "badge-success" : "badge-ghost"}`}>{group.status === 1 ? (zh ? "已启用" : "Enabled") : (zh ? "已禁用" : "Disabled")}</span></td><td className="max-w-sm whitespace-normal text-sm text-muted-foreground">{group.description}</td><td className="text-right"><div className="flex justify-end gap-2"><button type="button" className="btn btn-xs btn-outline" onClick={() => startEdit(group)} disabled={busy}>{copy.edit}</button>{group.name !== "default" && <button type="button" className="btn btn-xs btn-ghost text-error" onClick={() => void remove(group)} disabled={busy}>{copy.remove}</button>}</div></td></tr>)}</tbody></table>{groups.length === 0 && <p className="py-12 text-center text-sm text-muted-foreground">{copy.empty}</p>}</section>
  </div>;
}
