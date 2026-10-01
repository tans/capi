import { Section } from "@/components/marketing/page-hero";
import { SectionHeading } from "@/components/section";
import { getDictionary } from "@/lib/i18n";
import type { Locale } from "@/lib/i18n/config";

export type LegalSection = { title: string; body: string[] };

export function LegalDoc({
  locale,
  eyebrow,
  title,
  updated,
  intro,
  sections,
}: {
  locale: Locale;
  eyebrow: string;
  title: string;
  updated: string;
  intro: string;
  sections: LegalSection[];
}) {
  const isZh = locale === "zh";

  return (
    <>
      <Section className="pb-0">
        <p className="eyebrow">{eyebrow}</p>
        <h1 className="display-1 mt-4 text-foreground">{title}</h1>
        <p className="mt-3 font-mono text-[11px] text-muted-foreground">
          {isZh ? "文档状态" : "Status"}: {updated}
        </p>
        <p className="mt-6 max-w-2xl text-[15px] leading-relaxed text-muted-foreground">
          {intro}
        </p>
        <div role="note" className="mt-7 max-w-3xl rounded-md border border-amber-500/30 bg-amber-50/70 p-5 text-[13px] leading-relaxed text-amber-950">
          <p className="font-semibold">{isZh ? "法律文案草稿 · 尚未生效" : "Draft legal copy · not in effect"}</p>
          <p className="mt-2">
            {isZh
              ? "以下内容是迁移自产品原型的示例文本，不构成现行隐私政策或服务协议。服务运营方应核实实际做法并完成法律审核后再正式发布。"
              : "This is illustrative copy from the product prototype, not an operative privacy policy or service agreement. The service operator must verify actual practices and obtain legal review before adopting it."}
          </p>
        </div>
      </Section>

      <Section>
        <div className="max-w-3xl">
          <div className="flex flex-col gap-10">
            {sections.map((section, i) => (
              <div key={section.title}>
                <SectionHeading title={section.title} className="block" />
                <p className="mt-3 font-mono text-[11px] text-muted-foreground">
                  {isZh ? "第" : "Section"}{" "}
                  {String(i + 1).padStart(2, "0")}
                  {isZh ? " 节" : ""}
                </p>
                <div className="mt-4 flex flex-col gap-4">
                  {section.body.map((paragraph) => (
                    <p
                      key={paragraph.slice(0, 40)}
                      className="text-[14px] leading-relaxed text-muted-foreground"
                    >
                      {paragraph}
                    </p>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <p className="mt-14 rounded-md border border-border bg-muted/40 p-5 text-[13px] leading-relaxed text-muted-foreground">
            {isZh
              ? "本文档是产品原型使用的示例文案，不构成法律意见，也不具备任何合同效力。"
              : "This document is illustrative sample copy for a product prototype. It is not legal advice and has no contractual effect."}
          </p>
        </div>
      </Section>
    </>
  );
}

/** Shared by the Terms and Privacy pages so the copy lives with its page. */
export function legalNavLabel(locale: Locale) {
  return getDictionary(locale).terms.eyebrow;
}
