import { Activity, Boxes, Coins, GitBranch, ShieldCheck, SlidersHorizontal } from "lucide-react";

import { Section, SectionHeading, Surface } from "@/components/section";
import { getDictionary } from "@/lib/i18n";
import type { Locale } from "@/lib/i18n/config";

const capabilityIcons = [
  Boxes,
  SlidersHorizontal,
  ShieldCheck,
  Coins,
  Activity,
  GitBranch,
];

/** Gateway capability grid, mirroring the product-advantage framing. */
export function Capabilities({ locale }: { locale: Locale }) {
  const t = getDictionary(locale).home.capabilities;

  return (
    <div className="section-rule">
      <Section>
        <SectionHeading
          align="center"
          eyebrow={t.eyebrow}
          title={t.title}
          description={t.description}
        />

        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {t.items.map((item, i) => {
            const Icon = capabilityIcons[i] ?? Boxes;
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
    </div>
  );
}
