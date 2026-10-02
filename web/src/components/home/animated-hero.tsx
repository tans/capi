import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { getDictionary, type Dictionary } from "@/lib/i18n";
import { localeHref, type Locale } from "@/lib/i18n/config";

type HeroCopy = Dictionary["home"]["hero"];
type Phase = "idle" | "outbound" | "routing" | "inbound";

type ModelRow = {
  name: string;
  tagKey: "video" | "image" | "llm";
  provider: string;
};

const modelRows: ModelRow[] = [
  { name: "Seedance 2.5", tagKey: "video", provider: "Kuaishou" },
  { name: "Kling v3", tagKey: "video", provider: "Kuaishou" },
  { name: "GPT Image 2", tagKey: "image", provider: "OpenAI" },
  { name: "Claude Opus 5", tagKey: "llm", provider: "Anthropic" },
  { name: "Gemini 3.1 Pro", tagKey: "llm", provider: "Google" },
  { name: "Flux 2", tagKey: "image", provider: "Black Forest Labs" },
  { name: "GPT-5.6 Sol", tagKey: "llm", provider: "OpenAI" },
];

const clients = [
  { name: "Claude Code", icon: "CC" },
  { name: "Codex", icon: "CX" },
  { name: "你的应用", icon: "YA" },
];

function ModalityIcon({ type }: { type: ModelRow["tagKey"] }) {
  if (type === "video") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4 fill-current">
        <path d="m9 7 8 5-8 5V7Z" />
      </svg>
    );
  }
  if (type === "image") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4 fill-none stroke-current" strokeWidth="1.8">
        <rect x="4" y="4" width="16" height="16" rx="2" />
        <circle cx="9" cy="9" r="1.5" />
        <path d="m5 17 4-4 3 3 2-2 5 5" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4 fill-none stroke-current" strokeWidth="1.8">
      <path d="M5 6.5h14v9H9l-4 3v-12Z" />
      <path d="M8 10.5h.01M12 10.5h.01M16 10.5h.01" strokeLinecap="round" strokeWidth="2.5" />
    </svg>
  );
}

function RouterMark() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-6 w-6 fill-none stroke-current" strokeWidth="2" strokeLinecap="round">
      <path d="M7 8v8M12 8v8M17 8v8" />
      <circle cx="7" cy="8" r="1.3" className="fill-current" />
      <circle cx="12" cy="8" r="1.3" className="fill-current" />
      <circle cx="17" cy="8" r="1.3" className="fill-current" />
    </svg>
  );
}

function AnimatedRoutingDiagram({
  t,
  locale,
  navLabels,
}: {
  t: HeroCopy;
  locale: Locale;
  navLabels: Dictionary["nav"];
}) {
  const [activeClient, setActiveClient] = useState(0);
  const [activeModel, setActiveModel] = useState(3);
  const [phase, setPhase] = useState<Phase>("idle");
  const isZh = locale === "zh";

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;

    const runCycle = () => {
      if (cancelled) return;
      setPhase("outbound");
      timer = setTimeout(() => {
        if (cancelled) return;
        setPhase("routing");
        timer = setTimeout(() => {
          if (cancelled) return;
          setActiveClient((current) => (current + 1) % clients.length);
          setActiveModel((current) => (current + 1) % modelRows.length);
          setPhase("inbound");
          timer = setTimeout(() => {
            if (cancelled) return;
            setPhase("idle");
            timer = setTimeout(runCycle, 2100);
          }, 760);
        }, 540);
      }, 660);
    };

    timer = setTimeout(runCycle, 900);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, []);

  const routeState = phase === "outbound" || phase === "routing" || phase === "inbound";

  return (
    <div className="routing-diagram relative mx-auto w-full max-w-5xl" data-phase={phase}>
      <svg className="routing-lines pointer-events-none absolute inset-0 z-0 h-full w-full" viewBox="0 0 1000 430" preserveAspectRatio="none" aria-hidden="true">
        <path className="routing-line" d="M185 155 C315 155 330 205 425 215" />
        <path className="routing-line" d="M185 215 C315 215 330 215 425 215" />
        <path className="routing-line" d="M185 275 C315 275 330 225 425 215" />
        <path className="routing-line" d="M575 215 C675 205 700 90 815 90" />
        <path className="routing-line" d="M575 215 C690 215 720 215 815 215" />
        <path className="routing-line" d="M575 215 C675 225 700 340 815 340" />
        <path
          className="routing-flow routing-flow-out"
          pathLength="1000"
          d={[
            "M185 155 C315 155 330 205 425 215",
            "M185 215 C315 215 330 215 425 215",
            "M185 275 C315 275 330 225 425 215",
          ][activeClient]}
        />
        <path
          className="routing-flow routing-flow-in"
          pathLength="1000"
          d={`M575 215 C675 ${215 + (90 + activeModel * 55 - 215) * 0.18} 700 ${90 + activeModel * 55 - 30} 815 ${90 + activeModel * 55}`}
        />
      </svg>

      <div className="routing-grid relative z-10 grid items-center gap-8 lg:grid-cols-[185px_minmax(250px,1fr)_320px]">
        <div className="routing-clients space-y-3">
          <p className="mb-5 text-[10px] font-mono uppercase tracking-[0.14em] text-muted-foreground">{t.diagramClients}</p>
          {clients.map((client, index) => (
            <div className={`routing-node routing-client relative flex items-center gap-3 rounded-xl border bg-card p-3.5 ${activeClient === index ? "is-active" : ""}`} key={client.name}>
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted text-[10px] font-bold text-muted-foreground">{client.icon}</div>
              <span className="text-[13px] font-medium">{client.name}</span>
            </div>
          ))}
        </div>

        <div className="routing-core flex flex-col items-center justify-center">
          <div className={`routing-router rounded-2xl border-2 bg-card p-7 ${phase === "routing" ? "is-routing" : ""}`}>
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand text-white"><RouterMark /></div>
              <div>
                <h3 className="text-xl font-bold tracking-tight">CAPI</h3>
                <p className="mt-0.5 text-[11px] text-muted-foreground">localhost:3425</p>
              </div>
            </div>
            <div className={`routing-status mt-4 ${phase === "routing" ? "is-visible" : ""}`} aria-live="polite">
              {isZh ? "智能路由" : "smart routing"}
            </div>
          </div>
          <div className="mt-6 space-y-1 text-center">
            <p className="text-[11px] font-mono text-muted-foreground">{t.diagramStable}</p>
            <p className="text-[11px] font-mono text-muted-foreground">{t.diagramCheaper}</p>
            <p className="text-[11px] font-mono text-brand">• {isZh ? "隐私保护" : "Privacy protected"}</p>
          </div>
        </div>

        <div className="routing-models space-y-2">
          <div className="mb-5 flex items-center justify-between">
            <p className="text-[10px] font-mono uppercase tracking-[0.14em] text-muted-foreground">{t.diagramModels}</p>
            <span className="rounded-md bg-brand px-2.5 py-1 text-[10px] font-bold text-white">API</span>
          </div>
          {modelRows.map((model, index) => (
            <div className={`routing-node routing-model relative flex items-center gap-2.5 rounded-xl border bg-card p-2.5 ${activeModel === index ? "is-active" : ""}`} key={model.name}>
              <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${model.tagKey === "video" ? "bg-purple-100 text-purple-700" : model.tagKey === "image" ? "bg-blue-100 text-blue-700" : "bg-emerald-100 text-emerald-700"}`}><ModalityIcon type={model.tagKey} /></div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[12px] font-semibold">{model.name}</p>
                <p className="truncate text-[10px] text-muted-foreground">{model.provider}</p>
              </div>
              <span className="text-[9px] font-mono text-muted-foreground">{navLabels[model.tagKey]}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-12 flex items-center justify-center gap-12 text-center">
        <div><p className="text-3xl font-bold text-foreground">1</p><p className="text-xs text-muted-foreground">{isZh ? "个请求" : "request"}</p></div>
        <div><p className="text-3xl font-bold text-brand">1</p><p className="text-xs text-muted-foreground">{isZh ? "次路由" : "routing call"}</p></div>
        <div><p className="text-3xl font-bold text-foreground">{modelRows.length}</p><p className="text-xs text-muted-foreground">{isZh ? "个可用模型" : "models available"}</p></div>
      </div>
    </div>
  );
}

export function AnimatedHero({ locale }: { locale: Locale }) {
  const dict = getDictionary(locale);
  const t = dict.home.hero;
  const href = (path: string) => localeHref(locale, path);

  return (
    <section className="relative overflow-hidden bg-gradient-to-b from-background via-background to-muted/20 py-20 lg:py-32">
      <style>{`
        .routing-lines { overflow: visible; }
        .routing-line { fill: none; stroke: var(--border); stroke-width: 2; stroke-linecap: round; }
        .routing-node { border-color: var(--border); transition: border-color 420ms ease, box-shadow 420ms ease, transform 420ms ease, background-color 420ms ease; }
        .routing-node.is-active { border-color: color-mix(in oklab, var(--brand) 52%, white); background: color-mix(in oklab, var(--brand-muted) 68%, white); box-shadow: 0 12px 28px color-mix(in oklab, var(--brand) 15%, transparent); transform: translateY(-2px); }
        .routing-router { border-color: var(--border); box-shadow: 0 18px 32px rgb(10 10 10 / 12%); transition: border-color 320ms ease, box-shadow 320ms ease, transform 320ms ease; }
        .routing-router.is-routing { border-color: var(--brand); box-shadow: 0 18px 38px color-mix(in oklab, var(--brand) 23%, transparent); transform: scale(1.035); }
        .routing-status { height: 24px; border-radius: 999px; background: var(--foreground); color: var(--background); opacity: 0; padding: 1px 12px; text-align: center; font: 500 10px/1.8 var(--font-geist-mono); transform: scaleY(0.65); transform-origin: center; transition: transform 240ms ease, opacity 240ms ease; }
        .routing-status.is-visible { opacity: 1; transform: scaleY(1); }
        .routing-flow { fill: none; stroke: var(--brand); stroke-width: 6; stroke-linecap: round; stroke-dasharray: 38 962; stroke-dashoffset: 1000; filter: drop-shadow(0 0 6px color-mix(in oklab, var(--brand) 55%, transparent)); animation: routePacket 2.6s linear infinite; }
        .routing-flow-in { animation-delay: 1.1s; }
        @keyframes routePacket { to { stroke-dashoffset: 0; } }
        @media (max-width: 1023px) { .routing-lines { display: none; } }
        @media (max-width: 767px) { .routing-grid { grid-template-columns: 1fr; } .routing-core { order: -1; } .routing-clients, .routing-models { max-width: 30rem; width: 100%; margin-inline: auto; } .routing-clients { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; } .routing-clients > p { grid-column: 1 / -1; margin-bottom: 4px; } .routing-client { padding: 10px; flex-direction: column; text-align: center; gap: 7px; } .routing-client span { font-size: 11px; } }
        @media (prefers-reduced-motion: reduce) { .routing-node, .routing-router, .routing-status { transition-duration: 1ms; } .routing-flow { animation: none; stroke-dasharray: none; stroke-dashoffset: 0; opacity: 0.55; } }
      `}</style>
      <div className="absolute inset-0 -z-10 overflow-hidden"><div className="absolute left-1/2 top-0 h-[600px] w-[600px] -translate-x-1/2 rounded-full bg-brand/5 blur-3xl" /></div>
      <div className="container-page">
        <div className="mb-16 text-center">
          <p className="eyebrow mx-auto">{t.eyebrow}</p>
          <h1 className="display-1 mx-auto mt-6 max-w-4xl text-foreground">{t.titleA} <span className="text-brand">{t.titleAccent}</span> {t.titleB}</h1>
          <p className="mx-auto mt-6 max-w-2xl text-[15px] leading-relaxed text-muted-foreground">{t.description}</p>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-5"><Button asChild size="xl"><Link href={href("/dashboard")}>{dict.common.openDashboard}</Link></Button><Link href={href("/contact")} className="text-[13px] text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline">{t.enterprise}</Link></div>
        </div>
        <AnimatedRoutingDiagram t={t} locale={locale} navLabels={dict.nav} />
      </div>
    </section>
  );
}
