import Link from "next/link";

import { ProviderMark } from "@/components/logo";
import { Section, SectionHeading } from "@/components/section";
import { Badge } from "@/components/ui/badge";
import { getDictionary } from "@/lib/i18n";
import { localeHref, type Locale } from "@/lib/i18n/config";
import { providers } from "@/lib/models-data";

const showcaseItems = [
  {
    key: "kling" as const,
    name: "Kling",
    tagKey: "video" as const,
    variant: "video" as const,
    gradient: "from-[#0f172a] via-[#1e3a8a] to-[#2563eb]",
  },
  {
    key: "veo" as const,
    name: "Veo 3",
    tagKey: "video" as const,
    variant: "video" as const,
    gradient: "from-[#1e1b4b] via-[#4c1d95] to-[#7c3aed]",
  },
  {
    key: "seedance" as const,
    name: "Seedance 2.5",
    tagKey: "video" as const,
    variant: "video" as const,
    gradient: "from-[#431407] via-[#c2410c] to-[#fb923c]",
  },
  {
    key: "flux" as const,
    name: "Flux",
    tagKey: "image" as const,
    variant: "image" as const,
    gradient: "from-[#111827] via-[#374151] to-[#9ca3af]",
  },
  {
    key: "midjourney" as const,
    name: "Midjourney",
    tagKey: "image" as const,
    variant: "image" as const,
    gradient: "from-[#0c4a6e] via-[#0369a1] to-[#38bdf8]",
  },
  {
    key: "suno" as const,
    name: "Suno v5.5",
    tagKey: "music" as const,
    variant: "audio" as const,
    gradient: "from-[#064e3b] via-[#047857] to-[#34d399]",
  },
];

export function Showcase({ locale }: { locale: Locale }) {
  const t = getDictionary(locale).home.showcase;

  return (
    <>
      <div className="container-page">
        <p className="text-[13px] text-muted-foreground">
          {t.promptPrefix}{" "}
          <Link
            href={localeHref(locale, "/models?modality=video")}
            className="text-brand underline-offset-4 hover:underline"
          >
            {t.promptLink}
          </Link>
        </p>
      </div>

      <Section className="pt-8">
        <SectionHeading eyebrow={t.eyebrow} title={t.title} />

        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {showcaseItems.map((item) => (
            <div
              key={item.key}
              className="overflow-hidden rounded-md border border-border bg-card"
            >
              <div
                className={`relative flex aspect-[16/10] items-end bg-gradient-to-br ${item.gradient} p-5`}
              >
                <span className="text-xl font-semibold tracking-tight text-white/95">
                  {item.name}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3 border-t border-border px-4 py-3">
                <span className="truncate text-[13px] text-muted-foreground">
                  {t.captions[item.key]}
                </span>
                <Badge variant={item.variant} className="shrink-0">
                  {t.tags[item.tagKey]}
                </Badge>
              </div>
            </div>
          ))}
        </div>
      </Section>

      <div className="section-rule">
        <Section>
          <h3 className="display-3 max-w-3xl text-foreground">{t.wallTitle}</h3>

          <div className="mt-9 grid grid-cols-3 gap-x-6 gap-y-7 sm:grid-cols-4 lg:grid-cols-6">
            {providers.map((provider) => (
              <div
                key={provider}
                className="flex items-center gap-2.5 transition-opacity hover:opacity-70"
              >
                <ProviderMark provider={provider} />
                <span className="truncate text-[13px] font-medium text-foreground">
                  {provider}
                </span>
              </div>
            ))}
          </div>
        </Section>
      </div>
    </>
  );
}
