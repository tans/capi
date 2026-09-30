import Link from "next/link";

import { CodeBlock } from "@/components/code-block";
import type { CodeTab } from "@/components/code-block";
import { getDictionary } from "@/lib/i18n";
import { localeHref, type Locale } from "@/lib/i18n/config";
import { modalityCounts, modelsByModality } from "@/lib/models-data";

const modalities = [
  {
    nameKey: "video" as const,
    modality: "video" as const,
    accent: "#3b82f6",
    count: modalityCounts.video,
    href: "/models?modality=video",
  },
  {
    nameKey: "image" as const,
    modality: "image" as const,
    accent: "#22d3ee",
    count: modalityCounts.image,
    href: "/models?modality=image",
  },
  {
    nameKey: "llm" as const,
    modality: "text" as const,
    accent: "#8b5cf6",
    count: modalityCounts.text,
    href: "/models?modality=text",
  },
];

function Modalities({ locale }: { locale: Locale }) {
  const dict = getDictionary(locale);
  const t = dict.home.modalities;

  return (
    <div className="py-16 sm:py-20">
      <div className="container-page">
        <h2 className="display-2 max-w-2xl text-white">{t.title}</h2>
        <p className="mt-4 max-w-md text-[15px] leading-relaxed text-ink-muted">
          {t.description}
        </p>

        <div className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {modalities.map((m) => (
            <Link
              key={m.nameKey}
              href={localeHref(locale, m.href)}
              className="group flex flex-col rounded-md border border-ink-border bg-ink-soft transition-colors hover:border-neutral-700"
            >
              <span
                aria-hidden="true"
                className="h-[3px] w-10 rounded-full"
                style={{ backgroundColor: m.accent }}
              />
              <div className="flex flex-1 flex-col p-5 pt-4">
                <h3 className="text-[15px] font-semibold tracking-tight text-white">
                  {dict.nav[m.nameKey]}
                </h3>
                <p className="mt-3 flex-1 text-[13px] leading-relaxed text-ink-muted">
                  {modelsByModality(m.modality).slice(0, 5).map((model) => (
                    <span key={model.slug} className="block">{model.name}</span>
                  ))}
                </p>
                <p className="mt-5 font-mono text-[11px] tracking-wider text-ink-muted">
                  {m.count} {t.countSuffix}
                </p>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}


const endpointTabs: CodeTab[] = [
  {
    label: "endpoints",
    language: "plaintext",
    code: `POST   /v1/videos
GET    /v1/tasks/{id}
POST   /v1/chat/completions
GET    /v1/me/balance`,
  },
  {
    label: "curl",
    language: "bash",
    code: `curl -X POST https://capi.minapp.xin/api/v1/videos \\
  -H "Authorization: Bearer YOUR_API_TOKEN" \\
  -H "Idempotency-Key: demo-video-001" \\
  -H "Content-Type: application/json" \\
  -d '{"model":"YOUR_VIDEO_MODEL","prompt":"A paper kite at sunrise"}'`,
  },
];

function Endpoints({ locale }: { locale: Locale }) {
  const t = getDictionary(locale).home.endpoints;

  return (
    <div className="border-t border-ink-border py-16 sm:py-20">
      <div className="container-page">
        <h2 className="display-2 text-white">{t.title}</h2>
        <p className="mt-4 max-w-lg text-[15px] leading-relaxed text-ink-muted">
          {t.description}
        </p>

        <CodeBlock tabs={endpointTabs} className="mt-8" />
      </div>
    </div>
  );
}

export function DarkSections({ locale }: { locale: Locale }) {
  return (
    <div className="bg-ink">
      <Modalities locale={locale} />
      <Endpoints locale={locale} />
    </div>
  );
}
