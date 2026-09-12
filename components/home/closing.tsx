import Link from "next/link";
import { BarChart3, Boxes, Check, Layers, ListTree, ShieldCheck, Sparkles, X } from "lucide-react";

import { Section, Surface } from "@/components/section";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
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
import { localeHref, type Locale } from "@/lib/i18n/config";

const buildIcons = [Layers, Sparkles, ListTree, Boxes];

export function WhatDevelopersBuild({ locale }: { locale: Locale }) {
  const t = getDictionary(locale).home.build;

  return (
    <Section>
      <h2 className="display-2 text-foreground">{t.title}</h2>

      <div className="mt-10 grid gap-4 sm:grid-cols-2">
        {t.cases.map((item, i) => {
          const Icon = buildIcons[i] ?? Layers;
          return (
            <Surface key={item.title}>
              <Icon className="size-[18px] text-brand" />
              <h3 className="mt-4 text-[15px] font-semibold tracking-tight text-foreground">
                {item.title}
              </h3>
              <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
                {item.body}
              </p>
            </Surface>
          );
        })}
      </div>
    </Section>
  );
}

export function ManageAccess({ locale }: { locale: Locale }) {
  const t = getDictionary(locale).home.manage;

  return (
    <div className="section-rule">
      <Section>
        <h2 className="display-2 max-w-3xl text-foreground">{t.title}</h2>
        <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-muted-foreground">
          {t.description}
        </p>

        <div className="mt-9 grid gap-4 sm:grid-cols-3">
          {t.cards.map((card, i) => {
            const Icon = [ShieldCheck, ShieldCheck, BarChart3][i] ?? ShieldCheck;
            return (
              <Surface key={card.title}>
                <Icon className="size-[18px] text-muted-foreground" />
                <h3 className="mt-4 text-[15px] font-semibold tracking-tight text-foreground">
                  {card.title}
                </h3>
                <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
                  {card.body}
                </p>
              </Surface>
            );
          })}
        </div>
      </Section>
    </div>
  );
}

export function TeamCta({ locale }: { locale: Locale }) {
  const t = getDictionary(locale).home.team;

  return (
    <div className="section-rule">
      <div className="container-page py-10">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="display-3 text-foreground">{t.title}</h3>
            <p className="mt-2 text-[14px] text-muted-foreground">
              {t.description}
            </p>
          </div>
          <Button asChild variant="outlineBrand" size="lg" className="uppercase">
            <Link href={localeHref(locale, "/contact")}>
              {getDictionary(locale).common.contactUs}
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}

/** Sentinel values let the Cell renderer decide between text and a glyph. */
function Cell({ value, highlight }: { value: string; highlight?: boolean }) {
  if (value === "yes") return <Check className="size-4 text-emerald-600" />;
  if (value === "no") return <X className="size-4 text-neutral-300" />;

  return (
    <span
      className={
        highlight ? "font-medium text-brand" : "text-muted-foreground"
      }
    >
      {value}
    </span>
  );
}

export function Comparison({ locale }: { locale: Locale }) {
  const t = getDictionary(locale).home.comparison;

  const rows: {
    feature: string;
    capi: string;
    alt: string;
    direct: string;
    highlight?: boolean;
  }[] = [
    {
      feature: t.rows.modalities,
      capi: t.values.modalities,
      alt: t.values.modalitiesAlt,
      direct: t.values.modalitiesDirect,
      highlight: true,
    },
    {
      feature: t.rows.models,
      capi: t.values.models,
      alt: t.values.modelsAlt,
      direct: t.values.modelsDirect,
      highlight: true,
    },
    {
      feature: t.rows.pricing,
      capi: t.values.pricing,
      alt: t.values.pricingAlt,
      direct: t.values.pricingDirect,
      highlight: true,
    },
    { feature: t.rows.skills, capi: "yes", alt: "no", direct: "no" },
    { feature: t.rows.async, capi: "yes", alt: "no", direct: "no" },
  ];

  return (
    <div className="section-rule">
      <Section>
        <h2 className="display-2 text-foreground">{t.title}</h2>

        <div className="mt-8 overflow-hidden rounded-md border border-border">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableHead>{t.feature}</TableHead>
                <TableHead className="text-brand">{t.capi}</TableHead>
                <TableHead>{t.openrouter}</TableHead>
                <TableHead>{t.direct}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.feature}>
                  <TableCell className="font-medium text-foreground">
                    {row.feature}
                  </TableCell>
                  <TableCell>
                    <Cell value={row.capi} highlight={row.highlight} />
                  </TableCell>
                  <TableCell>
                    <Cell value={row.alt} />
                  </TableCell>
                  <TableCell>
                    <Cell value={row.direct} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Section>
    </div>
  );
}


export function Faq({ locale }: { locale: Locale }) {
  const t = getDictionary(locale).home.faq;

  return (
    <div className="section-rule">
      <Section>
        <div className="flex flex-col items-center">
          <p className="eyebrow">{t.eyebrow}</p>
          <h2 className="display-2 mt-4 text-center text-foreground">
            {t.title}
          </h2>
        </div>

        <div className="mx-auto mt-12 max-w-3xl">
          <Accordion type="single" collapsible defaultValue="item-0">
            {t.items.map((faq, i) => (
              <AccordionItem key={faq.q} value={`item-${i}`}>
                <AccordionTrigger>{faq.q}</AccordionTrigger>
                <AccordionContent>{faq.a}</AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </Section>
    </div>
  );
}

export function FinalCta({ locale }: { locale: Locale }) {
  const t = getDictionary(locale).home.cta;

  return (
    <div className="section-rule">
      <div className="container-page py-20 sm:py-24">
        <div className="flex flex-col items-center">
          <h2 className="display-2 text-center text-foreground">{t.title}</h2>
          <p className="mt-4 text-center text-[15px] text-muted-foreground">
            {t.description}
          </p>
          <Button asChild variant="brand" size="lg" className="mt-8">
            <Link href={localeHref(locale, "/signup")}>
              {getDictionary(locale).common.getApiKey}
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
