"use client";

import { useState } from "react";
import { getDictionary } from "@/lib/i18n";
import type { Locale } from "@/lib/i18n/config";
import type { UsageRecord } from "@/lib/relay/types";
import { formatQuota, type Currency } from "@/lib/relay/currency";

function number(value: number, locale: Locale) {
  return new Intl.NumberFormat(locale === "zh" ? "zh-CN" : "en-US").format(value);
}

export function UsageLogTable({ records, locale, currency }: { records: UsageRecord[]; locale: Locale; currency: Currency }) {
  const d = getDictionary(locale).dashboard.usage;
  const [selectedPrompt, setSelectedPrompt] = useState<string | null>(null);
  const zh = locale === "zh";
  return <section className="overflow-hidden rounded-md border border-border bg-card">
    <div className="border-b border-border px-5 py-4"><h2 className="text-[15px] font-semibold">{d.title}</h2><p className="mt-1 text-xs text-muted-foreground">{zh ? "每次请求的模型、提示词、Token、扣费和响应状态。" : "Every request with its user prompt, tokens, charge, and response status."}</p></div>
    <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b text-left text-xs text-muted-foreground"><th className="p-3">{zh ? "时间" : "Time"}</th><th className="p-3">{d.table.model}</th><th className="p-3">{zh ? "API 密钥" : "API key"}</th><th className="p-3">{zh ? "提示词" : "Prompt"}</th><th className="p-3">{d.table.tokens}</th><th className="p-3">{d.table.spend}</th><th className="p-3">{zh ? "状态" : "Status"}</th></tr></thead>
      <tbody>{records.length ? records.map(record => <tr className="border-b last:border-0" key={record.id}><td className="whitespace-nowrap p-3 text-xs text-muted-foreground">{new Date(record.createdAt).toLocaleString(zh ? "zh-CN" : "en-US")}</td><td className="p-3 font-mono text-xs">{record.requestModel || record.model}</td><td className="p-3 text-xs">{record.keyName}</td><td className="p-3">{record.prompt ? <button type="button" className="btn btn-ghost btn-xs" onClick={() => setSelectedPrompt(record.prompt ?? "")}>{zh ? "查看" : "View"}</button> : <span className="text-xs text-muted-foreground">-</span>}</td><td className="p-3 font-mono text-xs">{number(record.promptTokens + record.completionTokens, locale)}<span className="ml-1 text-muted-foreground">({number(record.promptTokens, locale)} / {number(record.completionTokens, locale)})</span></td><td className="p-3 font-mono text-xs">{formatQuota(record.quota, currency, 4)}</td><td className="p-3"><span className={record.success ? "text-emerald-600" : "text-destructive"}>{record.success ? (zh ? "成功" : "Success") : (zh ? `失败 ${record.statusCode}` : `Failed ${record.statusCode}`)}</span></td></tr>) : <tr><td colSpan={7} className="p-10 text-center text-sm text-muted-foreground">{zh ? "暂无使用记录" : "No usage records yet"}</td></tr>}</tbody>
    </table></div>
    {selectedPrompt !== null && <dialog open className="modal modal-open" onClick={event => { if (event.target === event.currentTarget) setSelectedPrompt(null); }}><div className="modal-box max-w-3xl"><div className="flex items-start justify-between gap-4"><h3 className="font-semibold">{zh ? "用户提示词" : "User prompt"}</h3><button type="button" className="btn btn-sm btn-square btn-ghost" aria-label={zh ? "关闭" : "Close"} onClick={() => setSelectedPrompt(null)}>×</button></div><pre className="mt-4 max-h-[60vh] overflow-auto whitespace-pre-wrap break-words text-sm">{selectedPrompt}</pre></div></dialog>}
  </section>;
}
