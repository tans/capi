import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { getDictionary, type Dictionary } from "@/lib/i18n";
import { localeHref, type Locale } from "@/lib/i18n/config";

type HeroCopy = Dictionary["home"]["hero"];

const modelRows: {
  name: string;
  tagKey: "video" | "image" | "llm";
  provider: string;
}[] = [
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

/**
 * Animated routing diagram inspired by Magpie's intent-based routing visualization
 */
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
  const [activeModel, setActiveModel] = useState(0);
  const [isClassifying, setIsClassifying] = useState(false);
  const [showDot, setShowDot] = useState<'client' | 'model' | null>(null);
  const isZh = locale === "zh";

  useEffect(() => {
    const interval = setInterval(() => {
      // Phase 1: Client sends request
      setShowDot('client');
      setTimeout(() => {
        setIsClassifying(true);
        setShowDot(null);
      }, 600);

      // Phase 2: Router processes
      setTimeout(() => {
        setActiveClient((prev) => (prev + 1) % clients.length);
        setActiveModel((prev) => (prev + 1) % modelRows.length);
        setShowDot('model');
        setIsClassifying(false);
      }, 1200);

      // Phase 3: Model responds
      setTimeout(() => {
        setShowDot(null);
      }, 1800);
    }, 4000);

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="relative mx-auto w-full max-w-4xl">
      {/* Main container with 3 columns */}
      <div className="grid grid-cols-[180px_1fr_240px] items-center gap-8">
        {/* Left: Clients */}
        <div className="space-y-3">
          <p className="mb-4 text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
            {t.diagramClients}
          </p>
          {clients.map((client, i) => (
            <div
              key={client.name}
              className={`
                relative rounded-lg border bg-card p-3 transition-all duration-500
                ${activeClient === i
                  ? "border-brand/40 bg-brand/5 shadow-lg shadow-brand/10 scale-105"
                  : "border-border scale-100"
                }
              `}
            >
              <div className="flex items-center gap-2">
                <div className={`
                  flex h-8 w-8 items-center justify-center rounded-md text-[10px] font-bold transition-all duration-300
                  ${activeClient === i ? "bg-brand/20 text-brand" : "bg-muted text-muted-foreground"}
                `}>
                  {client.icon}
                </div>
                <span className="text-xs font-medium">{isZh && client.name === "你的应用" ? client.name : client.name}</span>
              </div>

              {/* Animated connector line with flow effect */}
              {activeClient === i && (
                <>
                  {/* Dashed curved line */}
                  <svg className="absolute left-full top-1/2 h-12 w-24 -translate-y-1/2" style={{ overflow: 'visible' }}>
                    <path
                      d="M 0 0 Q 40 -20, 96 0"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      fill="none"
                      strokeDasharray="4 4"
                      className="text-brand/40"
                    />
                  </svg>
                  {/* Moving dot */}
                  {showDot === 'client' && (
                    <div
                      className="absolute left-full top-1/2 h-2 w-2 -translate-y-1/2 rounded-full bg-brand shadow-lg shadow-brand/50"
                      style={{
                        animation: 'moveDotToRouter 0.6s ease-out forwards',
                      }}
                    />
                  )}
                </>
              )}
            </div>
          ))}
        </div>

        {/* Center: CAPI Router */}
        <div className="flex flex-col items-center justify-center">
          <div className={`
            relative rounded-2xl border-2 bg-card p-8 shadow-xl transition-all duration-500
            ${isClassifying
              ? "border-brand/60 shadow-brand/20 scale-105"
              : "border-border scale-100"
            }
          `}>
            <div className="mb-3 flex items-center justify-center gap-3">
              <div className={`flex h-12 w-12 items-center justify-center rounded-xl bg-brand transition-all duration-300 ${isClassifying ? 'animate-pulse' : ''}`}>
                <svg viewBox="0 0 24 24" className="h-6 w-6 text-white" fill="none">
                  <path d="M7 8v8m5-8v8m5-8v8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  <circle cx="7" cy="8" r="1.5" fill="currentColor" />
                  <circle cx="12" cy="8" r="1.5" fill="currentColor" />
                  <circle cx="17" cy="8" r="1.5" fill="currentColor" />
                </svg>
              </div>
              <div>
                <h3 className="text-xl font-bold">CAPI</h3>
                <p className="text-[10px] text-muted-foreground">localhost:3425</p>
              </div>
            </div>

            {isClassifying && (
              <div className="mt-2 rounded-full bg-foreground px-3 py-1 text-center text-[10px] font-medium text-background animate-[fadeIn_0.3s_ease-in]">
                {isZh ? "路由中..." : "routing..."}
              </div>
            )}
          </div>

          {/* Bottom labels */}
          <div className="mt-6 space-y-1 text-center">
            <p className="text-[10px] font-mono text-muted-foreground">
              {t.diagramStable}
            </p>
            <p className="text-[10px] font-mono text-muted-foreground">
              {t.diagramCheaper}
            </p>
            <p className="text-[10px] font-mono text-brand">
              {isZh ? "• 隐私保护" : "• Privacy Protected"}
            </p>
          </div>
        </div>

        {/* Right: Models */}
        <div className="space-y-2">
          <div className="mb-4 flex items-center justify-between">
            <p className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
              {t.diagramModels}
            </p>
            <span className="rounded-md bg-brand px-2 py-0.5 text-[9px] font-bold text-white">
              API
            </span>
          </div>

          {modelRows.map((model, i) => (
            <div
              key={model.name}
              className={`
                relative rounded-lg border p-2.5 transition-all duration-500
                ${activeModel === i
                  ? "border-brand/40 bg-brand/5 shadow-md scale-105"
                  : "border-border bg-card scale-100"
                }
              `}
            >
              {activeModel === i && (
                <>
                  {/* Dashed curved line */}
                  <svg className="absolute right-full top-1/2 h-12 w-24 -translate-y-1/2" style={{ overflow: 'visible' }}>
                    <path
                      d="M 96 0 Q 56 20, 0 0"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      fill="none"
                      strokeDasharray="4 4"
                      className="text-brand/40"
                    />
                  </svg>
                  {/* Moving dot */}
                  {showDot === 'model' && (
                    <div
                      className="absolute right-full top-1/2 h-2 w-2 -translate-y-1/2 rounded-full bg-brand shadow-lg shadow-brand/50"
                      style={{
                        animation: 'moveDotToModel 0.6s ease-out forwards',
                      }}
                    />
                  )}
                </>
              )}

              <div className="flex items-center gap-2">
                <div className={`
                  flex h-6 w-6 items-center justify-center rounded-md
                  ${model.tagKey === "video" ? "bg-purple-100 text-purple-600" :
                    model.tagKey === "image" ? "bg-blue-100 text-blue-600" :
                    "bg-green-100 text-green-600"}
                `}>
                  {model.tagKey === "video" && "▶"}
                  {model.tagKey === "image" && "🖼"}
                  {model.tagKey === "llm" && "💬"}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] font-semibold truncate">{model.name}</p>
                  <p className="text-[9px] text-muted-foreground truncate">{model.provider}</p>
                </div>
                <span className="text-[8px] font-mono text-muted-foreground">
                  {navLabels[model.tagKey]}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Stats at bottom */}
      <div className="mt-12 flex items-center justify-center gap-12 text-center">
        <div>
          <p className="text-3xl font-bold text-foreground">1</p>
          <p className="text-xs text-muted-foreground">{isZh ? "个请求" : "request"}</p>
        </div>
        <div>
          <p className="text-3xl font-bold text-brand">1</p>
          <p className="text-xs text-muted-foreground">{isZh ? "次路由" : "routing call"}</p>
        </div>
        <div>
          <p className="text-3xl font-bold text-foreground">{modelRows.length}</p>
          <p className="text-xs text-muted-foreground">{isZh ? "个可用模型" : "models available"}</p>
        </div>
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
      {/* Add keyframes for dot animations */}
      <style>{`
        @keyframes moveDotToRouter {
          0% {
            left: 100%;
            top: 50%;
            transform: translate(0, -50%);
          }
          100% {
            left: calc(100% + 96px);
            top: calc(50% - 20px);
            transform: translate(0, -50%);
          }
        }
        @keyframes moveDotToModel {
          0% {
            right: 100%;
            top: 50%;
            transform: translate(0, -50%);
          }
          100% {
            right: calc(100% + 96px);
            top: calc(50% + 20px);
            transform: translate(0, -50%);
          }
        }
      `}</style>

      {/* Background decoration */}
      <div className="absolute inset-0 -z-10 overflow-hidden">
        <div className="absolute left-1/2 top-0 h-[600px] w-[600px] -translate-x-1/2 rounded-full bg-brand/5 blur-3xl" />
      </div>

      <div className="container-page">
        {/* Title Section */}
        <div className="mb-16 text-center">
          <p className="eyebrow mx-auto">{t.eyebrow}</p>
          <h1 className="display-1 mx-auto mt-6 max-w-4xl text-foreground">
            {t.titleA} <span className="text-brand">{t.titleAccent}</span>{" "}
            {t.titleB}
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-[15px] leading-relaxed text-muted-foreground">
            {t.description}
          </p>

          <div className="mt-10 flex flex-wrap items-center justify-center gap-5">
            <Button asChild size="xl">
              <Link href={href("/dashboard")}>{dict.common.openDashboard}</Link>
            </Button>
            <Link
              href={href("/contact")}
              className="text-[13px] text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
            >
              {t.enterprise}
            </Link>
          </div>
        </div>

        {/* Animated Diagram */}
        <AnimatedRoutingDiagram t={t} locale={locale} navLabels={dict.nav} />
      </div>
    </section>
  );
}
