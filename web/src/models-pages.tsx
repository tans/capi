import { Link, useLocation } from "react-router-dom";
import { ArrowLeft, Check, Copy } from "lucide-react";
import { useMemo, useState } from "react";
import { ModelCatalog } from "@/components/models/model-catalog";
import { getDictionary } from "@/lib/i18n";
import { localeHref, type Locale } from "@/lib/i18n/config";
import { models as documentedModels, type ModelEntry, type Modality } from "@/lib/models-data";
import { ProviderMark } from "@/components/logo";
import { useResource } from "./api";

type PublicModel = { id: string; provider: string; protocol: string; inputMicrosPerMillion: number; outputMicrosPerMillion: number; capabilities: string[] };

function displayPrice(n: number) {
  return `$${(n / 1_000_000).toFixed(2).replace(/\.?0+$/, "")}`;
}

function catalogModels(rows: PublicModel[], locale: Locale): ModelEntry[] {
  const staticById = new Map(documentedModels.flatMap((m) => m.variants.map((v) => [v.id, m] as const)));
  return rows.map((row) => {
    const source = staticById.get(row.id);
    const modality: Modality = source?.modality ?? (row.capabilities[0] as Modality) ?? "text";
    const name = source?.name ?? row.id;
    const tokenPriced = modality === "text" && (row.inputMicrosPerMillion > 0 || row.outputMicrosPerMillion > 0);
    const price = tokenPriced
      ? `${displayPrice(row.inputMicrosPerMillion)} input · ${displayPrice(row.outputMicrosPerMillion)} output / 1M tokens`
      : locale === "zh" ? "费率由渠道配置" : "Rate configured by channel";
    return {
      ...(source ?? { slug: row.id, provider: row.provider, modality, badge: modalityMetaLabel(modality), tagline: locale === "zh" ? "通过 CAPI 渠道提供。" : "Available through an enabled CAPI channel.", priceFrom: { amount: "configured", unit: "" }, capabilities: row.capabilities, variants: [] }),
      slug: row.id,
      name,
      provider: source?.provider ?? row.provider,
      modality,
      priceFrom: { amount: tokenPriced ? String(row.inputMicrosPerMillion / 1_000_000) : "configured", unit: tokenPriced ? "1M tokens" : "" },
      variants: [{ id: row.id, name, price }],
    };
  });
}

function modalityMetaLabel(modality: Modality) {
  return ({ text: "Text", image: "Image", video: "Video", audio: "Audio", music: "Music", utility: "Utility" })[modality];
}

export default function ModelsPages({ locale }: { locale: Locale }) {
  const t = getDictionary(locale).models;
  const state = useResource<{ data: PublicModel[] }>("/api/public/models");
  const models = useMemo(() => catalogModels(state.data?.data ?? [], locale), [state.data, locale]);
  const location = useLocation();
  const modelId = decodeURIComponent(location.pathname.replace(/^\/(?:en|zh)\/models\/?/, "").split("/")[0] ?? "");
  const model = models.find((entry) => entry.slug === modelId);
  const [copied, setCopied] = useState(false);
  const copy = async () => { await navigator.clipboard.writeText(modelId); setCopied(true); window.setTimeout(() => setCopied(false), 1600); };

  if (state.loading || state.error) return <main className="container-page min-h-[55vh] py-14">{state.loading ? <div role="status" className="flex items-center gap-3 py-10 text-sm text-muted-foreground"><span className="loading loading-spinner loading-sm" />{locale === "zh" ? "正在加载…" : "Loading…"}</div> : <div role="alert" className="alert alert-error"><span>{state.error?.message}</span><button className="btn btn-sm" onClick={() => window.dispatchEvent(new Event("capi:refresh"))}>{locale === "zh" ? "重试" : "Retry"}</button></div>}</main>;
  if (!modelId) return <><section className="bg-ink py-14 text-white"><div className="container-page"><p className="font-mono text-[11px] uppercase tracking-[.2em] text-ink-muted">{t.eyebrow}</p><h1 className="display-2 mt-3">{t.title.replace("{count}", String(models.length))}</h1><p className="mt-4 max-w-2xl text-sm text-ink-muted">{t.description}</p></div></section><ModelCatalog locale={locale} models={models} /></>;
  if (!model) return <main className="container-page min-h-[55vh] py-14"><Link className="inline-flex items-center gap-2 text-sm text-muted-foreground" to={localeHref(locale, "/models")}><ArrowLeft className="size-4" />{t.detail.backToModels}</Link><h1 className="display-3 mt-8">{t.notFound}</h1></main>;

  const supportedRoute = model.modality === "text" ? "/v1/chat/completions" : model.modality === "image" ? "/v1/images/generations" : model.modality === "video" ? "/v1/videos" : model.modality === "utility" && model.slug.includes("jev") ? "/v1/systemone" : null;
  const request = supportedRoute ? `curl "$CAPI_BASE${supportedRoute}" \\\n+  -H "Authorization: Bearer $CAPI_API_KEY" \\\n+  -H "Content-Type: application/json" \\\n+  -d '{"model":"${modelId}","${model.modality === "text" ? "messages" : model.modality === "image" ? "prompt" : "input"}":${model.modality === "text" ? '[{"role":"user","content":"Hello"}]' : '"your request"'}}'` : null;
  const rate = model.variants[0]?.price;
  return <main className="container-page py-10"><Link className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground" to={localeHref(locale, "/models")}><ArrowLeft className="size-4" />{t.detail.backToModels}</Link><section className="mt-10 grid gap-10 lg:grid-cols-[minmax(0,1fr)_300px]"><div><ProviderMark provider={model.provider} /><h1 className="display-2 mt-5">{model.name}</h1><p className="mt-2 text-sm text-muted-foreground">{t.detail.by} {model.provider}</p><p className="mt-6 max-w-2xl text-[15px] leading-7 text-muted-foreground">{model.tagline}</p><h2 className="mt-10 text-lg font-semibold">{t.detail.availableModels}</h2><p className="mt-2 text-sm text-muted-foreground">{t.detail.availableModelsHint} <code className="rounded bg-muted px-1.5 py-0.5">model</code> {t.detail.availableModelsHintSuffix}</p><div className="mt-4 overflow-hidden rounded-md border border-border"><div className="grid grid-cols-[1fr_1fr] bg-muted/40 px-4 py-2 text-xs font-medium"><span>{t.detail.modelId}</span><span>{t.detail.priceColumn}</span></div>{model.variants.map((variant) => <div key={variant.id} className="grid grid-cols-[1fr_1fr] gap-2 border-t border-border px-4 py-3 text-sm"><code className="break-all">{variant.id}</code><span className="text-muted-foreground">{variant.price}</span></div>)}</div>{model.capabilities.length > 0 && <><h2 className="mt-10 text-lg font-semibold">{t.detail.capabilities}</h2><div className="mt-3 flex flex-wrap gap-2">{model.capabilities.map((capability) => <span key={capability} className="badge badge-outline">{capability}</span>)}</div></>}</div><aside className="h-fit rounded-md border border-border bg-card p-5"><h2 className="text-sm font-semibold">{t.detail.pricingStartsAt}</h2><p className="mt-2 font-mono text-sm">{rate}</p><p className="mt-3 text-xs leading-5 text-muted-foreground">{t.detail.pricingNote}</p></aside></section>{request && <section className="mt-12 max-w-3xl"><h2 className="text-lg font-semibold">{t.detail.quickstart}</h2><div className="relative mt-4 overflow-hidden rounded-md bg-ink p-5 text-[12px] text-white"><button onClick={() => void copy()} className="absolute right-3 top-3 btn btn-xs btn-ghost text-white" aria-label={copied ? "Copied" : "Copy model ID"}>{copied ? <Check className="size-4" /> : <Copy className="size-4" />}</button><pre className="overflow-x-auto pr-8"><code>{request}</code></pre></div></section>}</main>;
}
