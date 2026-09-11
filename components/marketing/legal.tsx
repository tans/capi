import { Section } from "@/components/marketing/page-hero";
import { SectionHeading } from "@/components/section";

export type LegalSection = { title: string; body: string[] };

export function LegalDoc({
  eyebrow,
  title,
  updated,
  intro,
  sections,
}: {
  eyebrow: string;
  title: string;
  updated: string;
  intro: string;
  sections: LegalSection[];
}) {
  return (
    <>
      <Section className="pb-0">
        <p className="eyebrow">{eyebrow}</p>
        <h1 className="display-1 mt-4 text-foreground">{title}</h1>
        <p className="mt-3 font-mono text-[11px] text-muted-foreground">
          Last updated {updated}
        </p>
        <p className="mt-6 max-w-2xl text-[15px] leading-relaxed text-muted-foreground">
          {intro}
        </p>
      </Section>

      <Section>
        <div className="max-w-3xl">
          <div className="flex flex-col gap-10">
            {sections.map((section, i) => (
              <div key={section.title}>
                <SectionHeading title={section.title} className="block" />
                <p className="mt-3 font-mono text-[11px] text-muted-foreground">
                  Section {String(i + 1).padStart(2, "0")}
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
            This document is illustrative sample copy produced for a product
            prototype. It is not legal advice and has no contractual effect.
          </p>
        </div>
      </Section>
    </>
  );
}
