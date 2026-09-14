"use client";

import type { Locale } from "@/lib/i18n/config";
import type { UsageRecord } from "@/lib/relay/types";

function number(value: number, locale: Locale) { return new Intl.NumberFormat(locale === "zh" ? "zh-CN" : "en-US").format(value); }
function money(quota: number) { return `$${(quota / 500_000).toFixed(4)}`; }

export function UsageLogTable({ records, locale }: { records: UsageRecord[]; locale: Locale }) {
  const zh = locale === "zh";
  return <section className="overflow-hidden rounded-md border border-border bg-card"><div className="border-b border-border px-5 py-4"><h2 className="text-[15px] font-semibold">{zh ? "使用日志" : "Usage log"}</h2><p className="mt-1 text-xs text-muted-foreground">{zh ? "每次请求的模型、Token、扣费和响应状态。" : "Every request with model, tokens, charge, and response status."}</p></div><div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b text-left text-xs text-muted-foreground"><th className="p-3">{zh ? "时间" : "Time"}</th><th className="p-3">{zh ? "模型" : "Model"}</th><th className="p-3">{zh ? "API Key" : "API key"}</th><th className="p-3">{zh ? "Token" : "Tokens"}</th><th className="p-3">{zh ? "扣费" : "Charge"}</th><th className="p-3">{zh ? "状态" : "Status"}</th></tr></thead><tbody>{records.length ? records.map((record) => <tr className="border-b last:border-0" key={record.id}><td className="whitespace-nowrap p-3 text-xs text-muted-foreground">{new Date(record.createdAt).toLocaleString(locale === "zh" ? "zh-CN" : "en-US")}</td><td className="p-3 font-mono text-xs">{record.requestModel || record.model}</td><td className="p-3 text-xs">{record.keyName}</td><td className="p-3 font-mono text-xs">{number(record.promptTokens + record.completionTokens, locale)}<span className="ml-1 text-muted-foreground">({number(record.promptTokens, locale)} / {number(record.completionTokens, locale)})</span></td><td className="p-3 font-mono text-xs">{money(record.quota)}</td><td className="p-3"><span className={record.success ? "text-emerald-600" : "text-destructive"}>{record.success ? (zh ? "成功" : "Success") : (zh ? `失败 ${record.statusCode}` : `Failed ${record.statusCode}`)}</span></td></tr>) : <tr><td colSpan={6} className="p-10 text-center text-sm text-muted-foreground">{zh ? "暂无使用记录" : "No usage records yet"}</td></tr>}</tbody></table></div></section>;
}
