import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { ProviderMark } from "@/components/logo";
import { Badge } from "@/components/ui/badge";
import { getDictionary } from "@/lib/i18n";
import { localeHref, type Locale } from "@/lib/i18n/config";
import { modalityMeta, type ModelEntry } from "@/lib/models-data";
import { modelTaglinesZh } from "@/lib/models-i18n";
import { cn } from "@/lib/utils";

const variantMap = {
  text: "text",
  image: "image",
  video: "video",
  audio: "audio",
  utility: "utility",
} as const;

/** Modality badge labels — the English badge doubles as the lookup key. */
const badgeZh: Record<string, string> = {
  Text: "大模型",
  Image: "图像",
  Video: "视频",
  Music: "音乐",
  Audio: "音频",
  Utility: "工具",
};

export function ModelCard({
  model,
  locale,
  className,
}: {
  model: ModelEntry;
  locale: Locale;
  className?: string;
}) {
  const dict = getDictionary(locale);
  const meta = modalityMeta[model.modality];
  const tagline =
    locale === "zh" ? (modelTaglinesZh[model.slug] ?? model.tagline) : model.tagline;

  return (
    <Link
      href={localeHref(locale, `/models/${model.slug}`)}
      className={cn(
        "group flex flex-col rounded-md border border-border bg-card p-5 transition-colors hover:border-neutral-300",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <ProviderMark provider={model.provider} />
        <Badge variant={variantMap[meta.badgeVariant as keyof typeof variantMap]}>
          {locale === "zh" ? (badgeZh[meta.badge] ?? meta.badge) : meta.badge}
        </Badge>
      </div>

      <h3 className="mt-4 text-[15px] font-semibold tracking-tight text-foreground">
        {model.name}
      </h3>
      <p className="mt-0.5 text-[12px] text-muted-foreground">{model.provider}</p>

      <p className="mt-3 flex-1 text-[13px] leading-relaxed text-muted-foreground">
        {tagline}
      </p>

      <div className="mt-5 flex items-center justify-between gap-3 border-t border-border pt-4">
        <span className="font-mono text-[11px] text-muted-foreground">
          {dict.models.card.from} ${model.priceFrom.amount} /{" "}
          {model.priceFrom.unit}
        </span>
        <span className="flex items-center gap-1 text-[12px] font-medium text-brand">
          {dict.common.view}
          <ArrowRight className="size-3 transition-transform group-hover:translate-x-0.5" />
        </span>
      </div>
    </Link>
  );
}
