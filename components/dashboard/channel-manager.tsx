"use client";

import { useState } from "react";

type Props = { workspaceId: number; canManage: boolean; allowPlatformChannels: boolean };

export function ChannelManager({ workspaceId, canManage, allowPlatformChannels }: Props) {
  const [name, setName] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [models, setModels] = useState("");
  const [keys, setKeys] = useState("");
  const [enabled, setEnabled] = useState(allowPlatformChannels);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function updateDefaultChannel(next: boolean) {
    setError("");
    setEnabled(next);
    const response = await fetch(`/api/workspaces/${workspaceId}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ allowPlatformChannels: next }),
    });
    if (!response.ok) { setEnabled(!next); setError("Unable to update CAPI default channel"); }
  }

  async function create(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setSaving(true);
    const response = await fetch(`/api/workspaces/${workspaceId}/channels`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, baseUrl, models, keys, type: "openai-compatible" }),
    });
    if (!response.ok) {
      setError((await response.json().catch(() => ({}))).error || "Unable to create channel");
      setSaving(false);
      return;
    }
    location.reload();
  }

  return <div className="flex flex-col gap-4">
    <section className="rounded-md border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-4">
        <div><h2 className="font-medium">CAPI 默认渠道</h2><p className="mt-1 text-sm text-muted-foreground">使用 CAPI 平台维护的默认模型服务，无需自行配置上游。</p></div>
        {canManage && <input type="checkbox" className="toggle toggle-sm" checked={enabled} onChange={(event) => void updateDefaultChannel(event.target.checked)} aria-label="启用 CAPI 默认渠道" />}
      </div>
      <p className="mt-3 text-xs text-muted-foreground">{enabled ? "已启用" : "已停用"}</p>
    </section>
    {canManage && <form onSubmit={create} className="rounded-md border border-border bg-card p-4">
      <h2 className="font-medium">添加我的渠道</h2><p className="mt-1 text-sm text-muted-foreground">支持 DeepSeek、OpenAI 及其他 OpenAI 兼容官方服务。</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <input className="input input-bordered input-sm" placeholder="渠道名称，例如 DeepSeek" value={name} onChange={(event) => setName(event.target.value)} required />
        <input className="input input-bordered input-sm" type="url" placeholder="上游地址，例如 https://api.deepseek.com" value={baseUrl} onChange={(event) => setBaseUrl(event.target.value)} required />
        <textarea className="textarea textarea-bordered sm:col-span-2" rows={2} placeholder="模型列表，每行一个，例如 deepseek-chat\ndeepseek-reasoner" value={models} onChange={(event) => setModels(event.target.value)} required />
        <textarea className="textarea textarea-bordered sm:col-span-2" rows={2} placeholder="API Key，每行一个" value={keys} onChange={(event) => setKeys(event.target.value)} required autoComplete="off" />
      </div>
      {error && <p role="alert" className="mt-3 text-sm text-error">{error}</p>}
      <button className="btn btn-sm btn-primary mt-4" disabled={saving}>{saving ? "保存中…" : "添加渠道"}</button>
    </form>}
    {!canManage && error && <p role="alert" className="text-sm text-error">{error}</p>}
  </div>;
}
