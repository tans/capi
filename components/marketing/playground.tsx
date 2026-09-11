"use client";

import * as React from "react";
import Link from "next/link";
import { Play, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { getDictionary } from "@/lib/i18n";
import { localeHref, type Locale } from "@/lib/i18n/config";
import { models } from "@/lib/models-data";
import { cn } from "@/lib/utils";

const tabs = [
  { key: "video", modality: "video" },
  { key: "image", modality: "image" },
  { key: "music", modality: "music" },
  { key: "audio", modality: "audio" },
  { key: "text", modality: "text" },
] as const;

type TabKey = (typeof tabs)[number]["key"];

/** Modality-specific secondary controls, shown beside the prompt. */
const controls: Record<
  TabKey,
  { key: string; options: string[]; selected: number }[]
> = {
  video: [
    { key: "duration", options: ["5s", "10s"], selected: 0 },
    { key: "aspectRatio", options: ["16:9", "9:16", "1:1"], selected: 0 },
    { key: "resolution", options: ["720p", "1080p"], selected: 1 },
  ],
  image: [
    { key: "size", options: ["1024²", "1536×1024", "1024×1536"], selected: 1 },
    { key: "quality", options: ["low", "medium", "high"], selected: 2 },
  ],
  music: [
    { key: "length", options: ["30s", "60s", "full"], selected: 2 },
    { key: "vocals", options: ["yes", "instrumental"], selected: 0 },
  ],
  audio: [
    { key: "format", options: ["mp3", "wav"], selected: 0 },
    { key: "voice", options: ["alloy", "kore", "puck"], selected: 0 },
  ],
  text: [
    { key: "temperature", options: ["0", "0.3", "0.7", "1"], selected: 2 },
    { key: "stream", options: ["on", "off"], selected: 0 },
  ],
};

/** Labels for the modality-specific controls above. */
const controlLabels: Record<string, Record<Locale, string>> = {
  duration: { en: "Duration", zh: "时长" },
  aspectRatio: { en: "Aspect ratio", zh: "画面比例" },
  resolution: { en: "Resolution", zh: "分辨率" },
  size: { en: "Size", zh: "尺寸" },
  quality: { en: "Quality", zh: "质量" },
  length: { en: "Length", zh: "时长" },
  vocals: { en: "Vocals", zh: "人声" },
  format: { en: "Format", zh: "格式" },
  voice: { en: "Voice", zh: "音色" },
  temperature: { en: "Temperature", zh: "温度" },
  stream: { en: "Stream", zh: "流式输出" },
};

export function Playground({ locale }: { locale: Locale }) {
  const dict = getDictionary(locale);
  const t = dict.playground;

  const [active, setActive] = React.useState<TabKey>("video");
  const [values, setValues] = React.useState<Record<string, number>>({});

  const current = tabs.find((tab) => tab.key === active) ?? tabs[0];

  const available = React.useMemo(
    () => models.filter((m) => m.modality === current.modality).slice(0, 12),
    [current.modality],
  );

  const [modelOverride, setModelOverride] = React.useState<string | null>(null);

  // Derived rather than synced in an effect: when the modality changes, the
  // previous override is no longer in `available`, so we fall back to the new
  // modality's default model.
  const defaultModel = available[0]?.variants[0]?.id ?? "";
  const model = available.some((m) =>
    m.variants.some((v) => v.id === modelOverride),
  )
    ? (modelOverride as string)
    : defaultModel;

  const selected = models.find((m) =>
    m.variants.some((v) => v.id === model),
  );

  const activeControls = controls[current.key];

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.85fr)]">
      {/* Controls — presentational only, no generation is wired up. */}
      <div className="rounded-md border border-border bg-card p-4 sm:p-6">
        <div
          role="tablist"
          aria-label={t.eyebrow}
          className="flex flex-wrap items-center gap-1"
        >
          {tabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              role="tab"
              aria-selected={tab.key === active}
              onClick={() => setActive(tab.key)}
              className={cn(
                "rounded-[3px] px-3 py-1.5 font-mono text-[11px] tracking-wide transition-colors",
                tab.key === active
                  ? "bg-ink text-white"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {t.tabs[tab.key]}
            </button>
          ))}
        </div>

        <div className="mt-6 flex flex-col gap-5">
          <div className="flex flex-col gap-2">
            <label
              htmlFor="pg-model"
              className="font-mono text-[10px] tracking-[0.12em] text-muted-foreground uppercase"
            >
              {t.fields.model}
            </label>
            <select
              id="pg-model"
              value={model}
              onChange={(e) => setModelOverride(e.target.value)}
              className="h-9 rounded-sm border border-input bg-transparent px-3 text-[13px] shadow-xs outline-none focus-visible:border-brand/60"
            >
              {available.flatMap((m) =>
                m.variants.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.id}
                  </option>
                )),
              )}
            </select>
          </div>

          <div className="flex flex-col gap-2">
            <label
              htmlFor="pg-prompt"
              className="font-mono text-[10px] tracking-[0.12em] text-muted-foreground uppercase"
            >
              {t.fields.prompt}
            </label>
            <textarea
              id="pg-prompt"
              rows={4}
              placeholder={t.fields.promptPlaceholder}
              className="rounded-sm border border-input bg-transparent px-3 py-2.5 text-[13px] shadow-xs outline-none placeholder:text-muted-foreground focus-visible:border-brand/60"
            />
          </div>

          <div className="flex flex-col gap-5">
            {activeControls.map((control) => (
              <div key={control.key}>
                <p className="font-mono text-[10px] tracking-[0.12em] text-muted-foreground uppercase">
                  {controlLabels[control.key]?.[locale] ?? control.key}
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-1">
                  {control.options.map((option, i) => {
                    const chosen =
                      (values[`${current.key}-${control.key}`] ??
                        control.selected) === i;
                    return (
                      <button
                        key={option}
                        type="button"
                        onClick={() =>
                          setValues((v) => ({
                            ...v,
                            [`${current.key}-${control.key}`]: i,
                          }))
                        }
                        className={cn(
                          "rounded-[3px] border px-3 py-1.5 text-[12px] transition-colors",
                          chosen
                            ? "border-ink bg-ink text-white"
                            : "border-border text-muted-foreground hover:text-foreground",
                        )}
                      >
                        {option}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          <div className="rounded-sm border border-border bg-muted/40 px-4 py-3">
            <p className="font-mono text-[10px] tracking-[0.12em] text-muted-foreground uppercase">
              {t.fields.requestPreview}
            </p>
            <p className="mt-1.5 font-mono text-[11.5px] text-foreground">
              POST /api/v1/{current.key}/generate
            </p>
            {selected ? (
              <p className="mt-0.5 font-mono text-[11.5px] text-muted-foreground">
                model: {selected.variants[0]?.id}
              </p>
            ) : null}
          </div>

          <p className="font-mono text-[11px] text-muted-foreground">
            {t.fields.estimated}{" "}
            <span className="text-foreground">{selected?.priceFrom.amount ?? "0.07"} / {selected?.priceFrom.unit ?? "second"}</span>
          </p>

          <Button type="button" variant="brand" size="lg" disabled>
            <Sparkles className="size-4" />
            {t.fields.generate}
          </Button>
          <p className="text-center text-[11px] text-muted-foreground">
            {t.fields.signInPrefix}{" "}
            <Link
              href={localeHref(locale, "/login")}
              className="text-brand underline-offset-4 hover:underline"
            >
              {dict.common.signIn}
            </Link>
          </p>
        </div>
      </div>

      {/* Result surface */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-1 items-center justify-center rounded-md border border-border bg-muted/30 py-16">
          <span className="flex size-11 items-center justify-center rounded-full border border-border bg-background">
            <Play className="size-4 text-muted-foreground" />
          </span>
        </div>
        <p className="text-center text-[11px] text-muted-foreground">
          {t.fields.resultPlaceholder}
        </p>
        <div className="grid grid-cols-3 gap-3">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="aspect-video rounded-sm border border-border bg-muted/30"
            />
          ))}
        </div>
      </div>
    </div>
  );
}
