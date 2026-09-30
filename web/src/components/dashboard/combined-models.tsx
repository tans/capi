"use client";

import { useEffect, useState } from "react";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { Locale } from "@/lib/i18n/config";
import type { CombinedModel } from "@/lib/relay/combined-models";

export function CombinedModels({ workspaceId, locale, canManage }: { workspaceId: string; locale: Locale; canManage: boolean }) {
  const t = (zh: string, en: string) => locale === "zh" ? zh : en;
  const [items, setItems] = useState<CombinedModel[]>([]);
  const [available, setAvailable] = useState<string[]>([]);
  const [editing, setEditing] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [models, setModels] = useState(["", ""]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const endpoint = `/api/workspaces/${workspaceId}/combined-models`;

  useEffect(() => {
    let active = true;
    void fetch(endpoint).then(async (response) => {
      if (!response.ok) throw new Error(locale === "zh" ? "组合模型加载失败。" : "Unable to load combined models.");
      return response.json() as Promise<{ data: CombinedModel[]; availableModels: string[] }>;
    }).then((data) => { if (active) { setItems(data.data); setAvailable(data.availableModels); } })
      .catch((error) => { if (active) setMessage(error instanceof Error ? error.message : String(error)); });
    return () => { active = false; };
  }, [endpoint, locale]);

  function edit(item?: CombinedModel) {
    setEditing(item?.name ?? "");
    setName(item?.name ?? "");
    setModels(item ? [...item.models] : ["", ""]);
    setMessage("");
  }

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(endpoint, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ previousName: editing || undefined, name: name.trim(), models }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || t("保存失败。", "Unable to save."));
      setItems((current) => [...current.filter((item) => item.name !== editing), data as CombinedModel].sort((a, b) => a.name.localeCompare(b.name)));
      setEditing(null);
      setMessage(t("组合模型已保存。", "Combined model saved."));
    } catch (error) { setMessage(error instanceof Error ? error.message : String(error)); }
    finally { setBusy(false); }
  }

  async function remove(item: CombinedModel) {
    if (busy || !confirm(t(`删除组合模型 ${item.name}？`, `Delete combined model ${item.name}?`))) return;
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(`${endpoint}?name=${encodeURIComponent(item.name)}`, { method: "DELETE" });
      if (!response.ok) throw new Error(t("删除失败。", "Unable to delete."));
      setItems((current) => current.filter((entry) => entry.name !== item.name));
      setMessage(t("组合模型已删除。", "Combined model deleted."));
    } catch (error) { setMessage(error instanceof Error ? error.message : String(error)); }
    finally { setBusy(false); }
  }

  function move(index: number, direction: -1 | 1) {
    setModels((current) => {
      const next = [...current];
      [next[index], next[index + direction]] = [next[index + direction], next[index]];
      return next;
    });
  }

  return <section className="mt-8 border-t border-border pt-7">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <h2 className="text-lg font-semibold">{t("组合模型", "Combined models")}</h2>
      {canManage && editing === null && <button type="button" className="btn btn-sm" onClick={() => edit()}><Plus className="size-4" />{t("新建组合", "New combination")}</button>}
    </div>
    {message && editing === null && <p role="status" className="mt-3 text-sm text-muted-foreground">{message}</p>}
    <Dialog open={editing !== null} onOpenChange={(open) => { if (!busy) { if (!open) { setEditing(null); setMessage(""); } } }}>
      <DialogContent className="max-h-[85vh] overflow-y-auto" closeLabel={t("关闭", "Close")}>
        <DialogHeader>
          <DialogTitle>{editing === "" ? t("新建组合", "New combination") : t("编辑组合模型", "Edit combined model")}</DialogTitle>
          <DialogDescription>{t("设置对外模型名称和服务顺序。", "Set the public model name and service order.")}</DialogDescription>
        </DialogHeader>
        <form onSubmit={save} className="space-y-5">
          <label className="block max-w-md text-sm font-medium">{t("对外模型名称", "API model name")}<input className="input mt-2 w-full" value={name} maxLength={100} required disabled={busy} onChange={(event) => setName(event.target.value)} placeholder="my-fallback-model" /></label>
          <div className="space-y-3"><h3 className="text-sm font-medium">{t("服务顺序", "Service order")}</h3>
            {models.map((model, index) => <div key={index} className="flex items-center gap-2">
              <span className="w-6 shrink-0 text-sm tabular-nums text-muted-foreground">{index + 1}</span>
              <select className="select min-w-0 flex-1" aria-label={t(`第 ${index + 1} 个模型`, `Model ${index + 1}`)} value={model} required disabled={busy} onChange={(event) => setModels((current) => current.map((value, at) => at === index ? event.target.value : value))}><option value="">{t("选择模型", "Choose model")}</option>{model && !available.includes(model) && <option value={model}>{model}</option>}{available.map((option) => <option key={option} value={option} disabled={models.some((value, at) => at !== index && value === option)}>{option}</option>)}</select>
              <button type="button" className="btn btn-ghost btn-square btn-sm" aria-label={t("上移", "Move up")} title={t("上移", "Move up")} disabled={busy || index === 0} onClick={() => move(index, -1)}><ArrowUp className="size-4" /></button>
              <button type="button" className="btn btn-ghost btn-square btn-sm" aria-label={t("下移", "Move down")} title={t("下移", "Move down")} disabled={busy || index === models.length - 1} onClick={() => move(index, 1)}><ArrowDown className="size-4" /></button>
              <button type="button" className="btn btn-ghost btn-square btn-sm" aria-label={t("移除", "Remove")} title={t("移除", "Remove")} disabled={busy || models.length <= 2} onClick={() => setModels((current) => current.filter((_, at) => at !== index))}><Trash2 className="size-4" /></button>
            </div>)}
            {models.length < 10 && <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => setModels((current) => [...current, ""])}><Plus className="size-4" />{t("添加模型", "Add model")}</button>}
          </div>
          {message && <p role="alert" className="text-sm text-error">{message}</p>}
          <div className="flex justify-end gap-2"><button type="button" className="btn" disabled={busy} onClick={() => { setEditing(null); setMessage(""); }}>{t("取消", "Cancel")}</button><button type="submit" className="btn btn-primary" disabled={busy}>{busy ? t("保存中…", "Saving…") : t("保存组合", "Save combination")}</button></div>
        </form>
      </DialogContent>
    </Dialog>
    {editing === null ? <ul className="list mt-4 divide-y divide-border border-y border-border">
      {items.length === 0 && <li className="py-5 text-sm text-muted-foreground">{t("暂无组合模型。", "No combined models yet.")}</li>}
      {items.map((item) => <li key={item.name} className="list-row items-center px-0 py-3">
        <div className="list-col-grow min-w-0"><div className="font-medium break-all">{item.name}</div><div className="mt-1 text-xs text-muted-foreground break-all">{item.models.join(" → ")}</div></div>
        {canManage && <div className="flex gap-1"><button type="button" className="btn btn-ghost btn-sm" onClick={() => edit(item)}>{t("编辑", "Edit")}</button><button type="button" className="btn btn-ghost btn-square btn-sm" aria-label={t(`删除 ${item.name}`, `Delete ${item.name}`)} title={t("删除", "Delete")} disabled={busy} onClick={() => void remove(item)}><Trash2 className="size-4" /></button></div>}
      </li>)}
    </ul> : null}
  </section>;
}
