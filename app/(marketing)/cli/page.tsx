import type { Metadata } from "next";
import { Cpu, FileJson, Repeat, Terminal } from "lucide-react";

import { CodeBlock, CommandStrip } from "@/components/code-block";
import {
  ClosingCta,
  FeatureGrid,
  PageHero,
  Section,
  Steps,
} from "@/components/marketing/page-hero";
import { SectionHeading } from "@/components/section";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const metadata: Metadata = {
  title: "CLI",
  description:
    "Run Capi models from your terminal with JSON-first output and meaningful exit codes.",
};

const flags = [
  { flag: "--json", body: "Machine-readable output on stdout; progress on stderr." },
  { flag: "--output <path>", body: "Download the result as soon as the task completes." },
  { flag: "--no-wait", body: "Return the task id immediately instead of blocking." },
  { flag: "--max-cost <usd>", body: "Refuse a generation that would exceed the threshold." },
  { flag: "--base-url <url>", body: "Point at a proxy or a local mock." },
];

export default function CliPage() {
  return (
    <>
      <PageHero
        eyebrow="CLI"
        title="Run any model from your terminal"
        description="A thin, scriptable wrapper over the whole catalog. Every command speaks JSON, and exit codes are meaningful, so shell pipelines behave correctly."
        primary={{ label: "Get API Key", href: "/signup" }}
        secondary={{ label: "Read the docs", href: "/docs/resources/cli" }}
        code={
          <CodeBlock
            tabs={[
              {
                label: "SHELL",
                language: "bash",
                code: `capi video generate \\
  --model kling-v3-turbo-text-to-video \\
  --prompt "A paper kite above a coastal town at sunrise" \\
  --duration 5 \\
  --output kite.mp4`,
              },
              {
                label: "CLI",
                language: "bash",
                code: `capi models list --modality video
capi account balance
capi keys list`,
              },
            ]}
          />
        }
        meta={<CommandStrip command="npx -y @capi.ai/cli --help" />}
      />

      <Section>
        <SectionHeading
          eyebrow="Design"
          title="Built to be scripted"
          description="Anything the dashboard can do, the CLI can do — and it composes with the tools you already have."
        />
        <FeatureGrid
          className="mt-9"
          items={[
            {
              icon: FileJson,
              title: "JSON-first output",
              body: "Every command accepts --json and emits valid JSON on stdout, so piping into jq or xargs always works.",
            },
            {
              icon: Repeat,
              title: "Meaningful exit codes",
              body: "0 success, 1 request error, 2 task failed, 3 auth problem — so set -e behaves correctly in scripts.",
            },
            {
              icon: Cpu,
              title: "Parallel by default",
              body: "Tasks are fire-and-forget. Fan out with xargs -P and keep a configurable number of generations in flight.",
            },
            {
              icon: Terminal,
              title: "No install required",
              body: "Run it through npx, or install globally for a persistent capi binary on your PATH.",
            },
          ]}
          columns={2}
        />
      </Section>

      <div className="section-rule">
        <Section>
          <div className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <div>
              <SectionHeading eyebrow="Reference" title="Common flags" />
              <div className="mt-8 overflow-hidden rounded-md border border-border">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/40 hover:bg-muted/40">
                      <TableHead>Flag</TableHead>
                      <TableHead>Behaviour</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {flags.map((item) => (
                      <TableRow key={item.flag}>
                        <TableCell className="font-mono text-[12px] whitespace-normal text-foreground">
                          {item.flag}
                        </TableCell>
                        <TableCell className="whitespace-normal text-muted-foreground">
                          {item.body}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>

            <div>
              <SectionHeading eyebrow="Examples" title="Splitting submission from retrieval" />
              <Steps
                className="mt-8"
                items={[
                  {
                    title: "Submit without blocking",
                    body: "Capture the task id so the rest of your script can continue immediately.",
                    code: `TASK=$(capi video generate \\
  --model veo-3.1-text-to-video \\
  --prompt "harbour at dawn" \\
  --no-wait --json | jq -r .task_id)`,
                  },
                  {
                    title: "Poll and download",
                    body: "Wait on the task and write the file when it lands.",
                    code: `capi tasks get "$TASK" --wait --output dawn.mp4`,
                  },
                ]}
              />
            </div>
          </div>
        </Section>
      </div>

      <ClosingCta
        title="Generate from your shell today"
        description="Install the CLI, export your key, and every model in the catalog is one command away."
        secondary={{ label: "CLI docs", href: "/docs/resources/cli" }}
      />
    </>
  );
}

export const dynamic = "force-static";
