import Link from "next/link";

import { ProviderMark } from "@/components/logo";
import { Section, SectionHeading } from "@/components/section";
import { Badge } from "@/components/ui/badge";
import { providers } from "@/lib/models-data";

const showcase = [
  {
    name: "Kling",
    caption: "Kling Video",
    tag: "Video",
    variant: "video" as const,
    gradient: "from-[#0f172a] via-[#1e3a8a] to-[#2563eb]",
  },
  {
    name: "Veo 3",
    caption: "Veo 3 Video",
    tag: "Video",
    variant: "video" as const,
    gradient: "from-[#1e1b4b] via-[#4c1d95] to-[#7c3aed]",
  },
  {
    name: "Seedance 2.5",
    caption: "Fire choreography",
    tag: "Video",
    variant: "video" as const,
    gradient: "from-[#431407] via-[#c2410c] to-[#fb923c]",
  },
  {
    name: "Flux",
    caption: "Flux Image",
    tag: "Image",
    variant: "image" as const,
    gradient: "from-[#111827] via-[#374151] to-[#9ca3af]",
  },
  {
    name: "Midjourney",
    caption: "Midjourney Image",
    tag: "Image",
    variant: "image" as const,
    gradient: "from-[#0c4a6e] via-[#0369a1] to-[#38bdf8]",
  },
  {
    name: "Suno v5.5",
    caption: "Wide Open Sky",
    tag: "Music",
    variant: "audio" as const,
    gradient: "from-[#064e3b] via-[#047857] to-[#34d399]",
  },
];

export function Showcase() {
  return (
    <>
      <div className="container-page">
        <p className="text-[13px] text-muted-foreground">
          Choosing a video model?{" "}
          <Link
            href="/models?modality=video"
            className="text-brand underline-offset-4 hover:underline"
          >
            Compare Seedance 2.5, Kling v3, and Veo 3.1 APIs
          </Link>
        </p>
      </div>

      <Section className="pt-8">
        <SectionHeading eyebrow="Featured" title="Made with Capi" />

        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {showcase.map((item) => (
            <div
              key={item.name}
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
                  {item.caption}
                </span>
                <Badge variant={item.variant} className="shrink-0">
                  {item.tag}
                </Badge>
              </div>
            </div>
          ))}
        </div>
      </Section>

      <div className="section-rule">
        <Section>
          <h3 className="display-3 max-w-3xl text-foreground">
            200+ Models · 10+ AI services, unified under one API
          </h3>

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
