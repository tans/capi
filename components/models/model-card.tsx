import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { ProviderMark } from "@/components/logo";
import { Badge } from "@/components/ui/badge";
import { modalityMeta, type ModelEntry } from "@/lib/models-data";
import { cn } from "@/lib/utils";

const variantMap = {
  text: "text",
  image: "image",
  video: "video",
  audio: "audio",
  utility: "utility",
} as const;

export function ModelCard({
  model,
  className,
}: {
  model: ModelEntry;
  className?: string;
}) {
  const meta = modalityMeta[model.modality];

  return (
    <Link
      href={`/models/${model.slug}`}
      className={cn(
        "group flex flex-col rounded-md border border-border bg-card p-5 transition-colors hover:border-neutral-300",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <ProviderMark provider={model.provider} />
        <Badge variant={variantMap[meta.badgeVariant as keyof typeof variantMap]}>
          {model.badge}
        </Badge>
      </div>

      <h3 className="mt-4 text-[15px] font-semibold tracking-tight text-foreground">
        {model.name}
      </h3>
      <p className="mt-0.5 text-[12px] text-muted-foreground">
        {model.provider}
      </p>

      <p className="mt-3 flex-1 text-[13px] leading-relaxed text-muted-foreground">
        {model.tagline}
      </p>

      <div className="mt-5 flex items-center justify-between gap-3 border-t border-border pt-4">
        <span className="font-mono text-[11px] text-muted-foreground">
          from ${model.priceFrom.amount} / {model.priceFrom.unit}
        </span>
        <span className="flex items-center gap-1 text-[12px] font-medium text-brand">
          View
          <ArrowRight className="size-3 transition-transform group-hover:translate-x-0.5" />
        </span>
      </div>
    </Link>
  );
}
