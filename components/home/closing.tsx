import Link from "next/link";
import {
  BarChart3,
  Boxes,
  Check,
  Code2,
  Layers,
  ListTree,
  ShieldCheck,
  Sparkles,
  Terminal,
  X,
} from "lucide-react";

import { Section, SectionHeading, Surface } from "@/components/section";
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

const buildCases = [
  {
    icon: Layers,
    title: "AI-Powered Apps",
    body: "Ship image, video, and music generation into your product without managing provider accounts. One API key, one billing dashboard, one webhook format.",
  },
  {
    icon: Sparkles,
    title: "Agent Workflows",
    body: "Give Claude Code, Codex, Gemini CLI, and other coding agents access to 240+ models through MCP server or installable skills.",
  },
  {
    icon: ListTree,
    title: "Batch Media Pipelines",
    body: "Generate thousands of images, videos, or audio files with async task management and webhook callbacks. Poll or wait — the CLI and SDKs handle both.",
  },
  {
    icon: Boxes,
    title: "Multi-Model Prototyping",
    body: "Compare output quality across providers without separate signups. Switch from Kling to Veo to Seedance by changing one parameter.",
  },
];

export function WhatDevelopersBuild() {
  return (
    <Section>
      <h2 className="display-2 text-foreground">
        What Developers Build with Capi
      </h2>

      <div className="mt-10 grid gap-4 sm:grid-cols-2">
        {buildCases.map((item) => (
          <Surface key={item.title}>
            <item.icon className="size-[18px] text-brand" />
            <h3 className="mt-4 text-[15px] font-semibold tracking-tight text-foreground">
              {item.title}
            </h3>
            <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
              {item.body}
            </p>
          </Surface>
        ))}
      </div>
    </Section>
  );
}

const manageCards = [
  {
    icon: ShieldCheck,
    title: "Production ready",
    body: "Built for production workloads. Async task management, webhook callbacks, automatic retries, and predictable credit-based billing. SDKs in Python, Node.js, PHP, Java, Ruby, and Go.",
  },
  {
    icon: ShieldCheck,
    title: "Access Control",
    body: "Restrict keys to specific models or modalities. Revoke instantly without affecting other keys. Set expiration dates for temporary access.",
  },
  {
    icon: BarChart3,
    title: "Usage Analytics",
    body: "The team dashboard brings API keys, usage, cost tracking, and access status into one workspace.",
  },
];

export function ManageAccess() {
  return (
    <div className="section-rule">
      <Section>
        <h2 className="display-2 max-w-3xl text-foreground">
          Everything You Need to Manage API Access
        </h2>
        <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-muted-foreground">
          Give every project its own API key, budget, and permissions. Monitor
          usage across your organization in real time.
        </p>

        <div className="mt-9 grid gap-4 sm:grid-cols-3">
          {manageCards.map((card) => (
            <Surface key={card.title}>
              <card.icon className="size-[18px] text-muted-foreground" />
              <h3 className="mt-4 text-[15px] font-semibold tracking-tight text-foreground">
                {card.title}
              </h3>
              <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
                {card.body}
              </p>
            </Surface>
          ))}
        </div>
      </Section>
    </div>
  );
}

export function TeamCta() {
  return (
    <div className="section-rule">
      <div className="container-page py-10">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="display-3 text-foreground">Building with a team?</h3>
            <p className="mt-2 text-[14px] text-muted-foreground">
              We&apos;re here to help with enterprise setup, integrations, and
              technical questions.
            </p>
          </div>
          <Button asChild variant="outlineBrand" size="lg" className="uppercase">
            <Link href="/contact">Contact Us</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}

const comparisonRows: {
  feature: string;
  capi: string;
  openrouter: string;
  direct: string;
  capiHighlight?: boolean;
}[] = [
  {
    feature: "Modalities",
    capi: "Video, Image, Music, Audio, LLM",
    openrouter: "LLM only",
    direct: "Per provider",
    capiHighlight: true,
  },
  { feature: "Models", capi: "240+", openrouter: "300+ (LLM)", direct: "1 provider", capiHighlight: true },
  { feature: "Pricing", capi: "15-25% savings", openrouter: "Market rate", direct: "Official rate", capiHighlight: true },
  { feature: "SDKs", capi: "6 languages", openrouter: "2 languages", direct: "Varies", capiHighlight: true },
  { feature: "CLI", capi: "yes", openrouter: "no", direct: "no" },
  { feature: "MCP Server", capi: "yes", openrouter: "no", direct: "no" },
  { feature: "Agent Skills", capi: "yes", openrouter: "no", direct: "no" },
  { feature: "Async + Webhooks", capi: "yes", openrouter: "no", direct: "varies" },
];

function Cell({ value, highlight }: { value: string; highlight?: boolean }) {
  if (value === "yes") {
    return <Check className="size-4 text-emerald-600" />;
  }
  if (value === "no") {
    return <X className="size-4 text-neutral-300" />;
  }
  if (value === "varies") {
    return <span className="text-muted-foreground">Varies</span>;
  }
  return (
    <span className={highlight ? "font-medium text-brand" : "text-muted-foreground"}>
      {value}
    </span>
  );
}

export function Comparison() {
  return (
    <div className="section-rule">
      <Section>
        <h2 className="display-2 text-foreground">Capi vs Alternatives</h2>

        <div className="mt-8 overflow-hidden rounded-md border border-border">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableHead>Feature</TableHead>
                <TableHead className="text-brand">Capi</TableHead>
                <TableHead>OpenRouter</TableHead>
                <TableHead>Direct API</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {comparisonRows.map((row) => (
                <TableRow key={row.feature}>
                  <TableCell className="font-medium text-foreground">
                    {row.feature}
                  </TableCell>
                  <TableCell>
                    <Cell value={row.capi} highlight={row.capiHighlight} />
                  </TableCell>
                  <TableCell>
                    <Cell value={row.openrouter} />
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

const exploreCards = [
  {
    icon: Terminal,
    title: "MCP Server",
    body: "Connect Claude Code, Cursor, and MCP-compatible agents to 160+ models.",
    href: "/mcp",
  },
  {
    icon: Terminal,
    title: "CLI",
    body: "Run AI models from your terminal with JSON-first output.",
    href: "/cli",
  },
  {
    icon: Code2,
    title: "SDKs",
    body: "Python, Node.js, PHP, Java, Ruby, and Go SDKs for programmatic integration.",
    href: "/sdk",
  },
  {
    icon: Boxes,
    title: "Model Catalog",
    body: "Browse all 200+ models with pricing, parameters, and code samples.",
    href: "/models",
  },
];

export function Explore() {
  return (
    <div className="section-rule">
      <Section>
        <SectionHeading eyebrow="Explore" title="Developer Tools" />

        <div className="mt-9 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {exploreCards.map((card) => (
            <Surface key={card.title} className="flex flex-col">
              <card.icon className="size-[18px] text-muted-foreground" />
              <h3 className="mt-4 text-[15px] font-semibold tracking-tight text-foreground">
                {card.title}
              </h3>
              <p className="mt-2 flex-1 text-[13px] leading-relaxed text-muted-foreground">
                {card.body}
              </p>
              <Link
                href={card.href}
                className="mt-5 text-[13px] font-medium text-brand underline-offset-4 hover:underline"
              >
                Learn more
              </Link>
            </Surface>
          ))}
        </div>
      </Section>
    </div>
  );
}

const faqs = [
  {
    q: "How do I get started with Capi?",
    a: "Sign up for a free account at capi.ai, generate an API key from the dashboard, and make your first API request. No credit card is required. The quickstart takes under 10 minutes — install an SDK, set your API key as an environment variable, and call any model endpoint. The model catalog shows every available model with its parameters, pricing, and code samples.",
  },
  {
    q: "What AI models are available through Capi?",
    a: "Capi exposes 240+ models across five modalities: video (Kling, Veo, Seedance, Hailuo, Runway, Wan), image (GPT Image, Nano Banana, Flux, Midjourney, Seedream), music (Suno, Producer), audio (ElevenLabs, Fish Audio, Gemini TTS, Whisper), and language models (Claude, GPT, Gemini, DeepSeek, GLM, Qwen).",
  },
  {
    q: "How does Capi pricing work?",
    a: "Capi is credit-based and pay-as-you-go. Every model exposes its unit price before you call it — per 1M tokens for LLMs, per second for video, per call for images, per 1K characters for speech. There are no subscriptions and no monthly minimums, and each response includes the settled cost.",
  },
  {
    q: "Do you offer SDKs and developer tools?",
    a: "Yes. Official SDKs cover Python, Node.js, PHP, Java, Ruby, and Go, each with full type definitions and built-in task polling. There is also a CLI with JSON-first output, an MCP server for coding agents, and installable Agent Skills.",
  },
  {
    q: "What happens when a generation fails?",
    a: "Failed generations are never billed. The reserved credit is refunded and the task carries a structured error with the provider's failure reason, so you can retry or route to a different model.",
  },
  {
    q: "How does Capi handle async media generation?",
    a: "Video, music, and long-running image jobs are asynchronous. Submitting a task returns a task ID immediately; you can poll the task endpoint, wait on the SDK helper, or supply a callback_url to receive a signed webhook when the output is ready.",
  },
  {
    q: "Can I use Capi with AI coding agents?",
    a: "Yes. Capi ships an MCP server that gives Claude Code, Codex, Cursor, Windsurf, and Gemini CLI access to the full model catalog, plus Agent Skills for installable, task-specific workflows.",
  },
  {
    q: "Is Capi compatible with the OpenAI API format?",
    a: "Yes. The LLM surface exposes OpenAI-compatible /v1/chat/completions, /v1/responses, /v1/embeddings, and /v1/moderations endpoints, so existing OpenAI clients work by changing the base URL and API key. There are also Anthropic Messages and Gemini generateContent compatible routes.",
  },
  {
    q: "Do I need separate accounts with each AI provider?",
    a: "No. Capi holds the provider relationships, so you need one account and one API key. Billing, rate limits, retries, and webhooks are unified across every provider.",
  },
  {
    q: "What support and SLA does Capi offer?",
    a: "Self-serve accounts include documentation, status updates, and email support. Team and enterprise plans add a dedicated channel, custom rate limits, and a contractual uptime SLA with priority routing.",
  },
];

export function Faq() {
  return (
    <div className="section-rule">
      <Section>
        <div className="flex flex-col items-center">
          <p className="eyebrow">FAQ</p>
          <h2 className="display-2 mt-4 text-center text-foreground">
            Frequently asked questions
          </h2>
        </div>

        <div className="mx-auto mt-12 max-w-3xl">
          <Accordion type="single" collapsible defaultValue="item-0">
            {faqs.map((faq, i) => (
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

export function FinalCta() {
  return (
    <div className="section-rule">
      <div className="container-page py-20 sm:py-24">
        <div className="flex flex-col items-center">
          <h2 className="display-2 text-center text-foreground">
            Ready to build with AI?
          </h2>
          <p className="mt-4 text-center text-[15px] text-muted-foreground">
            Get your free API key and start generating in minutes.
          </p>
          <Button asChild variant="brand" size="lg" className="mt-8">
            <Link href="/signup">Get API Key</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
