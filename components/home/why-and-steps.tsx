import { Boxes, ShieldCheck, Tags } from "lucide-react";
import { getDictionary } from "@/lib/i18n";
import type { Locale } from "@/lib/i18n/config";

import { CodeBlock, CodeResponse } from "@/components/code-block";
import type { CodeTab } from "@/components/code-block";
import { Section } from "@/components/section";

const requestTabs: CodeTab[] = [
  {
    label: "cURL",
    language: "bash",
    code: `curl -X POST https://capi.minapp.xin/api/v1/kling/text_to_video \\
  -H "Authorization: Bearer YOUR_API_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "kling-v3-turbo-text-to-video",
    "prompt": "A paper kite flying above a quiet coastal town at sunrise",
    "duration_seconds": 5,
    "aspect_ratio": "16:9",
    "output_resolution": "720p"
  }'`,
  },
];

const responseBody = `{
  "billing": {
    "refund": null,
    "reservation": null,
    "settlement": null
  },
  "id": "tsk_reference_demo",
  "status": "completed",
  "videos": [
    {
      "url": "https://file.capi.minapp.xin/reference-video.mp4"
    }
  ]
}`;

export function WhyDevelopers({ locale }: { locale: Locale }) {
  const t = getDictionary(locale).home.why;

  const reasons = [
    { icon: Boxes, title: t.allModelsTitle, body: t.allModelsBody },
    { icon: ShieldCheck, title: t.productionTitle, body: t.productionBody },
    { icon: Tags, title: t.pricingTitle, body: t.pricingBody },
  ];

  return (
    <Section>
      <div className="grid gap-12 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] lg:gap-16">
        <div>
          <h2 className="display-2 max-w-sm text-foreground">{t.title}</h2>
          <p className="mt-4 max-w-md text-[15px] leading-relaxed text-muted-foreground">
            {t.subtitle}
          </p>

          <div className="mt-10 flex flex-col gap-8">
            {reasons.map((reason) => (
              <div key={reason.title} className="flex gap-3.5">
                <reason.icon className="mt-0.5 size-[18px] shrink-0 text-brand" />
                <div>
                  <h3 className="text-[15px] font-semibold tracking-tight text-foreground">
                    {reason.title}
                  </h3>
                  <p className="mt-1.5 max-w-md text-[13px] leading-relaxed text-muted-foreground">
                    {reason.body}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-4">
          <CodeBlock tabs={requestTabs} />
          <CodeResponse status="200" statusText="OK" code={responseBody} />
        </div>
      </div>
    </Section>
  );
}

export function HowItWorks({ locale }: { locale: Locale }) {
  const t = getDictionary(locale).home.how;
  const steps = t.steps.map((step, i) => ({ n: String(i + 1), ...step }));

  return (
    <div className="section-rule">
      <Section>
        <div className="flex flex-col items-center">
          <span className="eyebrow-solid">{t.badge}</span>
          <h2 className="display-2 mt-5 text-center text-foreground">
            {t.title}
          </h2>
        </div>

        <div className="mt-14 grid gap-10 sm:grid-cols-3">
          {steps.map((step, i) => (
            <div key={step.n} className="relative">
              {i < steps.length - 1 ? (
                <span
                  aria-hidden="true"
                  className="absolute top-3 left-[calc(50%+2rem)] hidden h-px w-[calc(100%-4rem)] border-t border-dashed border-border sm:block"
                />
              ) : null}
              <div className="flex flex-col items-center text-center">
                <span className="flex size-6 items-center justify-center rounded-[4px] bg-ink font-mono text-[11px] font-medium text-white">
                  {step.n}
                </span>
                <h3 className="mt-5 text-[15px] font-semibold tracking-tight text-foreground">
                  {step.title}
                </h3>
                <p className="mt-2 max-w-2xs text-[13px] leading-relaxed text-muted-foreground">
                  {step.body}
                </p>
              </div>
            </div>
          ))}
        </div>
      </Section>
    </div>
  );
}

