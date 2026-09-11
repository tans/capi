import type { Metadata } from "next";
import Link from "next/link";

import { ProviderMark } from "@/components/logo";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getDictionary } from "@/lib/i18n";
import { localeHref, type Locale } from "@/lib/i18n/config";
import { resolveLocale } from "@/lib/i18n/server";
import { modalityMeta, models } from "@/lib/models-data";
import { localizeDetail, localizePrice } from "@/lib/models-i18n";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = getDictionary(locale).dashboard.models;
  return { title: t.title, description: t.description };
}

const variantMap = {
  text: "text",
  image: "image",
  video: "video",
  audio: "audio",
  utility: "utility",
} as const;

export default async function DashboardModelsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const locale = (await resolveLocale(params)) as Locale;
  const t = getDictionary(locale).dashboard.models;
  const href = (path: string) => localeHref(locale, path);

  const rows = models.flatMap((model) =>
    model.variants.map((variant) => ({
      id: variant.id,
      family: model.name,
      provider: model.provider,
      modality: model.modality,
      badge: model.badge,
      detail: variant.detail ? localizeDetail(variant.detail, locale) : "—",
      price: localizePrice(variant.price, locale),
    })),
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight text-foreground">
            {t.title}
          </h1>
          <p className="mt-1 max-w-xl text-[13px] leading-relaxed text-muted-foreground">
            {t.description}
          </p>
        </div>
        <Link
          href={href("/models")}
          className="text-[13px] font-medium text-brand underline-offset-4 hover:underline"
        >
          {t.openCatalog}
        </Link>
      </div>

      <div className="overflow-hidden rounded-md border border-border bg-card">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>{t.table.modelId}</TableHead>
                <TableHead>{t.table.family}</TableHead>
                <TableHead>{t.table.modality}</TableHead>
                <TableHead>{t.table.detail}</TableHead>
                <TableHead>{t.table.rate}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="font-mono text-[12px] text-foreground">
                    {row.id}
                  </TableCell>
                  <TableCell>
                    <span className="flex items-center gap-2">
                      <ProviderMark
                        provider={row.provider}
                        className="size-6"
                      />
                      <span className="text-[13px] text-foreground">
                        {row.family}
                      </span>
                    </span>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        variantMap[
                          modalityMeta[row.modality].badgeVariant as keyof typeof variantMap
                        ]
                      }
                    >
                      {row.badge}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-[12px] text-muted-foreground">
                    {row.detail}
                  </TableCell>
                  <TableCell className="font-mono text-[12px] text-muted-foreground">
                    {row.price}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      <p className="text-[12px] text-muted-foreground">
        {t.footnote
          .replace("{count}", String(rows.length))
          .replace("{families}", String(models.length))}{" "}
        <Link
          href={href("/pricing")}
          className="text-brand underline-offset-4 hover:underline"
        >
          {t.footnotePricing}
        </Link>{" "}
        {t.footnoteSuffix}
      </p>
    </div>
  );
}
