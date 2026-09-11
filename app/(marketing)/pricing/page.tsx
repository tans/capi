import type { Metadata } from "next";
import Link from "next/link";
import { Check } from "lucide-react";

import { CodeBlock } from "@/components/code-block";
import {
  ClosingCta,
  FeatureGrid,
  PageHero,
  Section,
} from "@/components/marketing/page-hero";
import { SectionHeading } from "@/components/section";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const metadata: Metadata = {
  title: "Pricing",
  description:
    "Credit-based, pay-as-you-go pricing across video, image, music, audio, and LLM models.",
};

const priceRows = [
  { modality: "Video", unit: "per second", example: "Veo 3.1 Fast", from: "$0.06", href: "/models?modality=video" },
  { modality: "Image", unit: "per call", example: "GPT Image 2", from: "$0.03", href: "/models?modality=image" },
  { modality: "Music", unit: "per song", example: "Suno v5.5", from: "$0.18", href: "/models?modality=music" },
  { modality: "Audio", unit: "per 1K characters", example: "ElevenLabs TTS v3", from: "$0.04", href: "/models?modality=audio" },
  { modality: "LLM", unit: "per 1M input tokens", example: "GPT-5.6", from: "$2.50", href: "/models?modality=text" },
  { modality: "Embeddings", unit: "per 1M tokens", example: "Embedding 4 Large", from: "$0.13", href: "/models?modality=text" },
];

const included = [
  "Unlimited API keys, each with its own budget and scopes",
  "Async task management with automatic retries and refunds",
  "Webhook callbacks with signed deliveries",
  "SDKs for six languages, CLI, and the MCP server",
  "Usage analytics and per-key cost tracking",
];

export default function PricingPage() {
  return (
    <>
      <PageHero
        eyebrow="Pricing"
        title="Pay only for what you generate"
        description="No subscriptions and no minimums. Every model publishes its unit price before you call it, and each response reports the exact amount settled against your balance."
        primary={{ label: "Get API Key", href: "/signup" }}
        secondary={{ label: "See the catalog", href: "/models" }}
        code={
          <CodeBlock
            title="Response"
            subtitle="Cost is returned with every call"
            tabs={[
              {
                label: "JSON",
                language: "json",
                code: `{
  "task_id": "tsk_8f21c4ba",
  "status": "completed",
  "output": {
    "url": "https://file.capi.ai/v/tsk_8f21c4ba.mp4",
    "duration": 5
  },
  "cost": {
    "amount": 0.21,
    "currency": "USD"
  }
}`,
              },
            ]}
          />
        }
      />

      <Section>
        <SectionHeading
          eyebrow="Units"
          title="Billing follows the natural unit of each modality"
          description="You are never charged a flat rate for a model you barely use. Video bills by the second, images by the call, and LLMs by the token."
        />

        <div className="mt-8 overflow-hidden rounded-md border border-border">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableHead>Modality</TableHead>
                <TableHead>Billing unit</TableHead>
                <TableHead>Example model</TableHead>
                <TableHead>From</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {priceRows.map((row) => (
                <TableRow key={row.modality}>
                  <TableCell className="font-medium text-foreground">
                    {row.modality}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {row.unit}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {row.example}
                  </TableCell>
                  <TableCell className="font-mono text-[13px] font-medium text-brand">
                    {row.from}
                  </TableCell>
                  <TableCell>
                    <Link
                      href={row.href}
                      className="text-[13px] text-brand underline-offset-4 hover:underline"
                    >
                      Browse
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Section>

      <div className="section-rule">
        <Section>
          <div className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <div>
              <SectionHeading
                eyebrow="Included"
                title="Everything in the base rate"
                description="The platform features are not a paid tier. Keys, callbacks, SDKs, and analytics ship with every account."
              />
              <ul className="mt-8 flex flex-col gap-3">
                {included.map((item) => (
                  <li
                    key={item}
                    className="flex items-start gap-2.5 text-[14px] text-muted-foreground"
                  >
                    <Check className="mt-0.5 size-4 shrink-0 text-brand" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>

            <div className="flex flex-col gap-4">
              <FeatureGrid
                columns={2}
                items={[
                  {
                    title: "Failed generations are free",
                    body: "If a provider fails or filters a request, the reserved credit is released. You are only billed for delivered output.",
                  },
                  {
                    title: "No token markup games",
                    body: "Input and output prices are published per model, so you can compute the cost of a request before sending it.",
                  },
                  {
                    title: "Budgets as guardrails",
                    body: "Set a monthly cap per key. When it is reached, requests return 402 instead of silently spending.",
                  },
                  {
                    title: "Volume terms for teams",
                    body: "Team and enterprise plans add custom rate limits, invoicing, and a contractual uptime SLA.",
                  },
                ]}
              />
              <div className="rounded-md border border-border bg-muted/40 p-6">
                <p className="text-[15px] font-semibold tracking-tight text-foreground">
                  Building something large?
                </p>
                <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
                  High-volume commitments qualify for reduced unit pricing and
                  dedicated throughput. Tell us the shape of your workload.
                </p>
                <Button asChild variant="outlineBrand" className="mt-5 uppercase">
                  <Link href="/contact">Contact us</Link>
                </Button>
              </div>
            </div>
          </div>
        </Section>
      </div>

      <ClosingCta
        title="Start with free credits"
        description="Create an account, generate a key, and see exactly what each call costs before you commit."
        secondary={{ label: "Read the docs", href: "/docs" }}
      />
    </>
  );
}

export const dynamic = "force-static";
