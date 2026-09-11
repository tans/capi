import type { Metadata } from "next";
import Link from "next/link";
import { BarChart3, KeyRound, Lock, ScrollText, Users, Wallet } from "lucide-react";

import {
  ClosingCta,
  FeatureGrid,
  PageHero,
  Section,
} from "@/components/marketing/page-hero";
import { SectionHeading } from "@/components/section";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Teams",
  description:
    "Per-project keys, budgets, access control, and usage analytics for organisations building on Capi.",
};

const capabilities = [
  {
    icon: KeyRound,
    title: "A key per project",
    body: "Issue a key for every service, environment, and customer. Rotate or revoke one without touching the rest of your setup.",
  },
  {
    icon: Wallet,
    title: "Budgets as hard stops",
    body: "Attach a monthly cap to a key. When it is reached, requests return 402 rather than silently spending.",
  },
  {
    icon: Lock,
    title: "Scoped permissions",
    body: "Restrict a key to specific modalities or model families, so a front-end key cannot reach your billing surface.",
  },
  {
    icon: BarChart3,
    title: "Usage analytics",
    body: "Break spend down by key, model, modality, and time window. Export to CSV or read it through the API.",
  },
  {
    icon: Users,
    title: "Seat management",
    body: "Invite engineers with roles that separate billing access from key provisioning.",
  },
  {
    icon: ScrollText,
    title: "Audit log",
    body: "Every management action is recorded with the acting key, target, timestamp, and source address.",
  },
];

export default function TeamsPage() {
  return (
    <>
      <PageHero
        eyebrow="Teams"
        title="Give every project its own key, budget, and limits"
        description="One workspace for the whole organisation: isolate spend, constrain access, and see where the credits actually go."
        primary={{ label: "Contact sales", href: "/contact" }}
        secondary={{ label: "See pricing", href: "/pricing" }}
        code={
          <pre className="code-panel overflow-x-auto rounded-md border border-ink-border bg-ink px-5 py-4 font-mono text-[12.5px] leading-relaxed text-ink-foreground">
            <code>{`curl -X POST https://capi.ai/api/v1/platform/keys \\
  -H "Authorization: Bearer $CAPI_MANAGEMENT_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "name": "web-prod-images",
    "scopes": ["image.generate"],
    "budget": { "amount": 500, "period": "monthly" }
  }'`}</code>
          </pre>
        }
      />

      <Section>
        <SectionHeading
          eyebrow="Controls"
          title="Multi-model infrastructure needs multi-tenant guardrails"
        />
        <FeatureGrid className="mt-9" items={capabilities} columns={3} />
      </Section>

      <div className="section-rule">
        <Section>
          <div className="grid gap-10 lg:grid-cols-3">
            {[
              {
                title: "Provision programmatically",
                body: "A management key can mint scoped standard keys, so onboarding a customer does not require a human in the dashboard.",
              },
              {
                title: "Separate credential classes",
                body: "Management keys cannot generate work, and generation keys cannot manage keys. A leak is contained either way.",
              },
              {
                title: "Enterprise terms",
                body: "Custom rate limits, invoicing, SSO, a private networking option, and a contractual uptime SLA.",
              },
            ].map((item) => (
              <div key={item.title} className="border-t border-border pt-6">
                <h3 className="text-[15px] font-semibold tracking-tight text-foreground">
                  {item.title}
                </h3>
                <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
                  {item.body}
                </p>
              </div>
            ))}
          </div>

          <div className="mt-12 flex flex-wrap items-center gap-4 rounded-md border border-border bg-muted/40 px-6 py-5">
            <div className="flex-1">
              <p className="text-[15px] font-semibold tracking-tight text-foreground">
                Need a security review pack?
              </p>
              <p className="mt-1 text-[13px] text-muted-foreground">
                We can share our architecture summary, data-flow diagram, and
                retention policy.
              </p>
            </div>
            <Button asChild variant="outlineBrand" className="uppercase">
              <Link href="/contact">Request it</Link>
            </Button>
          </div>
        </Section>
      </div>

      <ClosingCta
        title="Roll Capi out across the org"
        description="Start with one project, then add keys, budgets, and seats as adoption grows."
        primary={{ label: "Contact sales", href: "/contact" }}
        secondary={{ label: "Platform docs", href: "/docs/guides/platform-management/quickstart" }}
      />
    </>
  );
}

export const dynamic = "force-static";
