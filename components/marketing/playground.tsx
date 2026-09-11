"use client";

import * as React from "react";
import Link from "next/link";
import { Play, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { models } from "@/lib/models-data";
import { cn } from "@/lib/utils";

const tabs = [
  { key: "video", label: "VIDEO", modality: "video" },
  { key: "image", label: "IMAGE", modality: "image" },
  { key: "music", label: "MUSIC", modality: "music" },
  { key: "audio", label: "AUDIO", modality: "audio" },
  { key: "llm", label: "LLM", modality: "text" },
] as const;

/** Modality-specific secondary controls, shown beside the prompt. */
const controls: Record<
  string,
  { label: string; options: string[]; selected: number }[]
> = {
  video: [
    { label: "Duration", options: ["5s", "10s"], selected: 0 },
    { label: "Aspect ratio", options: ["16:9", "9:16", "1:1"], selected: 0 },
    { label: "Resolution", options: ["720p", "1080p"], selected: 1 },
  ],
  image: [
    { label: "Size", options: ["1024²", "1536×1024", "1024×1536"], selected: 1 },
    { label: "Quality", options: ["low", "medium", "high"], selected: 2 },
  ],
  music: [
    { label: "Length", options: ["30s", "60s", "full"], selected: 2 },
    { label: "Vocals", options: ["yes", "instrumental"], selected: 0 },
  ],
  audio: [
    { label: "Format", options: ["mp3", "wav"], selected: 0 },
    { label: "Voice", options: ["alloy", "kore", "puck"], selected: 0 },
  ],
  llm: [
    { label: "Temperature", options: ["0", "0.3", "0.7", "1"], selected: 2 },
    { label: "Stream", options: ["on", "off"], selected: 0 },
  ],
};

const placeholders: Record<string, string> = {
  video: "A paper kite flying above a quiet coastal town at sunrise",
  image: "A minimal poster for a night train, deep blue background",
  music: "Warm indie folk about wide open skies",
  audio: "Welcome to Capi. Here is what changed this week.",
  llm: "Explain task queues to a new backend engineer in two paragraphs.",
};

export function Playground() {
  const [active, setActive] = React.useState<string>("video");
  const current = tabs.find((t) => t.key === active) ?? tabs[0];

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

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.85fr)]">
      <div className="rounded-md border border-border bg-card p-4 sm:p-6">
        <div
          role="tablist"
          aria-label="Modality"
          className="flex flex-wrap items-center gap-1"
        >
          {tabs.map((tab) => (
            <button
              key={tab.key}
              role="tab"
              aria-selected={tab.key === active}
              type="button"
              onClick={() => setActive(tab.key)}
              className={cn(
                "rounded-[3px] px-3 py-1.5 font-mono text-[11px] tracking-wide transition-colors",
                tab.key === active
                  ? "bg-brand text-white"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="mt-6 flex flex-col gap-5">
          <div>
            <label
              htmlFor="pg-model"
              className="font-mono text-[10px] tracking-[0.12em] text-muted-foreground uppercase"
            >
              Model
            </label>
            <select
              id="pg-model"
              value={model}
              onChange={(e) => setModelOverride(e.target.value)}
              className="mt-2 h-10 w-full rounded-sm border border-input bg-background px-3 text-[13px] text-foreground outline-none focus-visible:border-brand/60"
            >
              {available.map((m) =>
                m.variants.map((variant) => (
                  <option key={variant.id} value={variant.id}>
                    {m.name} · {variant.name}
                  </option>
                )),
              )}
            </select>
          </div>

          <div>
            <label
              htmlFor="pg-prompt"
              className="font-mono text-[10px] tracking-[0.12em] text-muted-foreground uppercase"
            >
              Prompt
            </label>
            <textarea
              id="pg-prompt"
              rows={4}
              placeholder={placeholders[active]}
              className="mt-2 w-full resize-y rounded-sm border border-input bg-background px-3 py-2.5 text-[13px] leading-relaxed outline-none placeholder:text-muted-foreground focus-visible:border-brand/60"
            />
          </div>

          <div className="flex flex-wrap gap-6">
            {(controls[active] ?? []).map((control) => (
              <div key={control.label}>
                <p className="font-mono text-[10px] tracking-[0.12em] text-muted-foreground uppercase">
                  {control.label}
                </p>
                <div className="mt-2 flex items-center gap-1">
                  {control.options.map((option, i) => (
                    <span
                      key={option}
                      className={cn(
                        "rounded-[3px] border px-2.5 py-1.5 text-[12px]",
                        i === control.selected
                          ? "border-foreground/20 bg-muted font-medium text-foreground"
                          : "border-transparent text-muted-foreground",
                      )}
                    >
                      {option}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <p className="font-mono text-[11px] text-muted-foreground">
            Estimated:{" "}
            <span className="text-foreground">
              from ${selected?.priceFrom.amount ?? "0.00"} /{" "}
              {selected?.priceFrom.unit ?? "call"}
            </span>
          </p>

          <Button variant="brand" size="lg" className="w-full uppercase">
            Generate
          </Button>
          <p className="text-center text-[12px] text-muted-foreground">
            This playground is a UI preview — generation is disabled in the
            demo.{" "}
            <Link
              href="/docs/guides/quickstart"
              className="text-brand underline-offset-4 hover:underline"
            >
              Call the API
            </Link>{" "}
            to produce real output.
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex flex-1 min-h-72 items-center justify-center rounded-md border border-border bg-ink">
          <div className="flex flex-col items-center gap-3">
            <span className="flex size-11 items-center justify-center rounded-full border border-ink-border">
              <Play className="size-4 text-ink-muted" />
            </span>
            <p className="font-mono text-[11px] tracking-wider text-ink-muted uppercase">
              Output
            </p>
          </div>
        </div>
        <div className="flex items-start gap-3 rounded-md border border-border bg-muted/40 px-4 py-3">
          <Sparkles className="mt-0.5 size-4 shrink-0 text-brand" />
          <p className="text-[12px] leading-relaxed text-muted-foreground">
            Results appear here once a request completes. The same call works
            from the CLI, an SDK, or your coding agent through MCP.
          </p>
        </div>
        <div className="grid grid-cols-3 gap-3">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="aspect-video rounded-sm border border-border bg-muted/60"
            />
          ))}
        </div>
      </div>
    </div>
  );
}
