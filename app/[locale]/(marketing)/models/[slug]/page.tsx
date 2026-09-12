import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight, Check } from "lucide-react";
import type { Metadata } from "next";

import { CodeBlock } from "@/components/code-block";
import type { CodeTab } from "@/components/code-block";
import { ProviderMark } from "@/components/logo";
import { ModelCard } from "@/components/models/model-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getDictionary } from "@/lib/i18n";
import { localeHref } from "@/lib/i18n/config";
import { resolveLocale } from "@/lib/i18n/server";
import {
  getModel,
  modalityMeta,
  models,
  modelsByModality,
  type ModelEntry,
} from "@/lib/models-data";
import {
  localizeDetail,
  localizePrice,
  modelTaglinesZh,
} from "@/lib/models-i18n";

export function generateStaticParams() {
  return models.map((model) => ({ slug: model.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}): Promise<Metadata> {
  const { locale, slug } = await params;
  const model = getModel(slug);
  if (!model) return { title: "Model not found" };

  const tagline =
    locale === "zh" ? (modelTaglinesZh[model.slug] ?? model.tagline) : model.tagline;

  return { title: `${model.name} API`, description: tagline };
}

const badgeVariantMap = {
  text: "text",
  image: "image",
  video: "video",
  audio: "audio",
  utility: "utility",
} as const;

const badgeZh: Record<string, string> = {
  Text: "大模型",
  Image: "图像",
  Video: "视频",
  Music: "音乐",
  Audio: "音频",
  Utility: "工具",
};

function codeTabsFor(model: ModelEntry): CodeTab[] {
  const id = model.variants[0]?.id ?? model.slug;

  if (model.modality === "text") {
    return [
      {
        label: "cURL",
        language: "bash",
        code: `curl https://capi.ai/api/v1/chat/completions \\
  -H "Authorization: Bearer YOUR_API_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "${id}",
    "messages": [{"role": "user", "content": "Hello"}]
  }'`,
      },
    ];
  }

  if (model.modality === "image") {
    return [
      {
        label: "cURL",
        language: "bash",
        code: `curl -X POST https://capi.ai/api/v1/images/generations \\
  -H "Authorization: Bearer YOUR_API_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{"model":"${id}","prompt":"A lighthouse at dusk"}'`,
      },
    ];
  }

  if (model.modality === "music") {
    return [
      {
        label: "cURL",
        language: "bash",
        code: `curl -X POST https://capi.ai/api/v1/suno/text_to_music \\
  -H "Authorization: Bearer YOUR_API_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{"model":"${id}","prompt":"Warm indie folk"}'`,
      },
    ];
  }

  if (model.modality === "audio") {
    return [
      {
        label: "cURL",
        language: "bash",
        code: `curl -X POST https://capi.ai/api/v1/audio/speech \\
  -H "Authorization: Bearer YOUR_API_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{"model":"${id}","input":"Welcome to Capi."}' \\
  --output out.mp3`,
      },
    ];
  }

  if (model.modality === "utility") {
    return [
      {
        label: "cURL",
        language: "bash",
        code: `curl -X POST https://capi.ai/api/v1/topaz/video_upscale \\
  -H "Authorization: Bearer YOUR_API_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{"model":"${id}","video_url":"https://file.capi.ai/input.mp4"}'`,
      },
    ];
  }

  return [
    {
      label: "cURL",
      language: "bash",
      code: `curl -X POST https://capi.ai/api/v1/kling/text_to_video \\
  -H "Authorization: Bearer YOUR_API_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "${id}",
    "prompt": "A paper kite flying above a quiet coastal town at sunrise",
    "duration_seconds": 5
  }'`,
    },
  ];
}

export default async function ModelDetailPage({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const locale = await resolveLocale(params);
  const { slug } = await params;
  const model = getModel(slug);

  if (!model) notFound();

  const dict = getDictionary(locale);
  const t = dict.models;
  const meta = modalityMeta[model.modality];
  const href = (path: string) => localeHref(locale, path);

  const modalityLabel = {
    video: dict.nav.video,
    image: dict.nav.image,
    music: dict.nav.music,
    audio: dict.nav.audio,
    text: dict.nav.llm,
    utility: dict.models.filters.utility,
  }[model.modality];

  const tagline =
    locale === "zh" ? (modelTaglinesZh[model.slug] ?? model.tagline) : model.tagline;

  const related = modelsByModality(model.modality)
    .filter((m) => m.slug !== model.slug)
    .slice(0, 3);

  return (
    <>
      <section className="border-b border-border">
        <div className="container-page py-10">
          <div className="flex items-center gap-2 font-mono text-[11px] text-muted-foreground">
            <Link
              href={href("/models")}
              className="flex items-center gap-1.5 transition-colors hover:text-foreground"
            >
              <ArrowLeft className="size-3" />
              {t.detail.backToModels}
            </Link>
            <span className="text-neutral-300">/</span>
            <span className="text-foreground">{model.name}</span>
          </div>

          <div className="mt-6 flex flex-wrap items-start justify-between gap-6">
            <div>
              <div className="flex items-center gap-3">
                <ProviderMark provider={model.provider} className="size-9" />
                <Badge
                  variant={
                    badgeVariantMap[
                      meta.badgeVariant as keyof typeof badgeVariantMap
                    ]
                  }
                >
                  {locale === "zh" ? (badgeZh[meta.badge] ?? meta.badge) : meta.badge}
                </Badge>
              </div>

              <h1 className="display-1 mt-5 text-foreground">{model.name}</h1>
              <p className="mt-2 font-mono text-[12px] text-muted-foreground">
                {t.detail.by} {model.provider}
              </p>
              <p className="mt-5 max-w-2xl text-[15px] leading-relaxed text-muted-foreground">
                {tagline}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <Button asChild variant="brand" size="lg" className="uppercase">
                <Link href={href("/signup")}>{dict.common.getApiKey}</Link>
              </Button>
              <Button asChild variant="outline" size="lg" className="uppercase">
                <Link href={href("/docs")}>{dict.common.readTheDocs}</Link>
              </Button>
            </div>
          </div>
        </div>
      </section>

      <div className="container-page grid items-start gap-12 py-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.95fr)]">
        <div className="flex flex-col gap-10">
          <div>
            <h2 className="text-[15px] font-semibold tracking-tight text-foreground">
              {t.detail.capabilities}
            </h2>
            <ul className="mt-4 grid gap-2.5 sm:grid-cols-2">
              {model.capabilities.map((capability) => (
                <li
                  key={capability}
                  className="flex items-center gap-2 text-[13px] text-muted-foreground"
                >
                  <Check className="size-3.5 text-brand" />
                  {capability}
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h2 className="text-[15px] font-semibold tracking-tight text-foreground">
              {t.detail.availableModels}
            </h2>
            <p className="mt-1.5 text-[13px] text-muted-foreground">
              {t.detail.availableModelsHint}{" "}
              <code className="rounded-[4px] border border-border bg-muted px-1.5 py-0.5 font-mono text-[12px]">
                model
              </code>{" "}
              {t.detail.availableModelsHintSuffix}
            </p>

            <div className="mt-5 overflow-hidden rounded-md border border-border">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40 hover:bg-muted/40">
                    <TableHead>{t.detail.modelId}</TableHead>
                    <TableHead>{t.detail.detailColumn}</TableHead>
                    <TableHead>{t.detail.priceColumn}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {model.variants.map((variant) => (
                    <TableRow key={variant.id}>
                      <TableCell className="font-mono text-[12px] text-foreground">
                        {variant.id}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {variant.detail
                          ? localizeDetail(variant.detail, locale)
                          : "—"}
                      </TableCell>
                      <TableCell className="font-mono text-[12px] text-muted-foreground">
                        {localizePrice(variant.price, locale)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>

          <div className="rounded-md border border-border bg-muted/40 p-5">
            <p className="font-mono text-[11px] tracking-wider text-muted-foreground uppercase">
              {t.detail.pricingStartsAt}
            </p>
            <p className="mt-2 text-[15px] font-semibold text-foreground">
              ${model.priceFrom.amount} / {model.priceFrom.unit}
            </p>
            <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
              {t.detail.pricingNote}
            </p>
          </div>
        </div>

        <div className="lg:sticky lg:top-32">
          <CodeBlock
            tabs={codeTabsFor(model)}
            title={t.detail.quickstart}
            subtitle={`${model.name} · ${model.variants[0]?.id ?? model.slug}`}
          />
        </div>
      </div>

      {related.length > 0 ? (
        <div className="section-rule">
          <div className="container-page py-12">
            <div className="flex items-center justify-between">
              <h2 className="display-3 text-foreground">
                {t.detail.moreModels.replace("{modality}", modalityLabel)}
              </h2>
              <Link
                href={href(`/models?modality=${model.modality}`)}
                className="flex items-center gap-1 text-[13px] font-medium text-brand underline-offset-4 hover:underline"
              >
                {dict.common.viewAll}
                <ArrowRight className="size-3.5" />
              </Link>
            </div>
            <div className="mt-7 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {related.map((item) => (
                <ModelCard key={item.slug} model={item} locale={locale} />
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
