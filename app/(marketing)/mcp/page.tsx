import type { Metadata } from "next";
import {
  Boxes,
  Coins,
  Gauge,
  ListTree,
  Search,
  ShieldCheck,
  Terminal,
} from "lucide-react";

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
  title: "MCP Server",
  description:
    "Give Claude Code, Codex, Cursor, and any MCP-capable agent access to 240+ models.",
};

const clients = [
  { title: "Claude Code", body: "MCP plus installable agent skills.", meta: "MCP + CLI" },
  { title: "Codex", body: "One command, then tools are available.", meta: "MCP" },
  { title: "Cursor", body: "Config entry under mcpServers.", meta: "MCP" },
  { title: "VS Code", body: "Workspace-scoped server definition.", meta: "MCP" },
  { title: "Windsurf", body: "Same shape as Cursor.", meta: "MCP" },
  { title: "Gemini CLI", body: "Registered through the CLI.", meta: "MCP" },
];

const tools = [
  { name: "list_models", body: "Search the catalog by modality, provider, or capability." },
  { name: "get_model", body: "Full parameter schema and pricing for one model." },
  { name: "generate", body: "Create a generation task and wait for the result." },
  { name: "get_task", body: "Poll an async task for status and output." },
  { name: "get_balance", body: "Read the remaining credit balance for the key." },
];

const safety = [
  {
    icon: ShieldCheck,
    title: "Scope the key",
    body: "The server acts with the permissions of the key it is given. Grant only the modalities the agent needs.",
  },
  {
    icon: Coins,
    title: "Cap the spend",
    body: "Pass --max-cost so a single call cannot exceed a threshold, and set a monthly budget on the key.",
  },
  {
    icon: Gauge,
    title: "Expect retries",
    body: "Agents retry failed steps. Video models are the expensive case — keep them off by default.",
  },
];

export default function McpPage() {
  return (
    <>
      <PageHero
        eyebrow="MCP Server"
        title="Give your coding agent every model"
        description="One MCP server exposes the whole catalog — video, image, music, audio, and LLMs — to Claude Code, Codex, Cursor, and any MCP-capable agent."
        primary={{ label: "Get API Key", href: "/signup" }}
        secondary={{ label: "Read the docs", href: "/docs/resources/mcp" }}
        code={<CodeBlock tabs={[{ label: "SHELL", language: "bash", code: "npx -y @capi.ai/mcp" }]} />}
        meta={
          <div className="flex flex-wrap items-center gap-3">
            <span className="flex items-center gap-2 font-mono text-[11px] text-muted-foreground">
              <span className="size-1.5 rounded-full bg-emerald-500" />
              Works with every MCP client
            </span>
            <CommandStrip command="npx -y @capi.ai/mcp" className="hidden sm:flex" />
          </div>
        }
      />

      <Section>
        <SectionHeading
          eyebrow="Targets"
          title="Works with the agents you already use"
          description="Register the server once and the agent gains the full catalog. No SDK, no custom tool definitions."
        />
        <FeatureGrid items={clients} columns={3} className="mt-9" />
      </Section>

      <div className="section-rule">
        <Section>
          <SectionHeading eyebrow="Tools" title="What the agent can call" />
          <div className="mt-8 overflow-hidden rounded-md border border-border">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead>Tool</TableHead>
                  <TableHead>Purpose</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tools.map((tool) => (
                  <TableRow key={tool.name}>
                    <TableCell className="font-mono text-[12px] text-foreground">
                      {tool.name}
                    </TableCell>
                    <TableCell className="whitespace-normal text-muted-foreground">
                      {tool.body}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Section>
      </div>

      <div className="section-rule">
        <Section>
          <div className="grid gap-12 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
            <div>
              <SectionHeading
                eyebrow="Setup"
                title="Connected in three steps"
              />
              <Steps
                className="mt-8"
                items={[
                  {
                    title: "Create a scoped key",
                    body: "Generate a key in the dashboard and restrict it to the modalities the agent needs.",
                    code: "export CAPI_API_KEY=\"capi_sk_live_...\"",
                  },
                  {
                    title: "Register the server",
                    body: "One command for Claude Code, Codex, and Gemini CLI. Cursor and VS Code use a JSON entry.",
                    code: "claude mcp add capi -- npx -y @capi.ai/mcp",
                  },
                  {
                    title: "Ask for media",
                    body: "Describe the asset you want. The agent picks a model, generates, waits, and returns the URL.",
                    code: "# \"Generate a 5s video of a kite at sunrise\"",
                  },
                ]}
              />
            </div>

            <div className="flex flex-col gap-4">
              <CodeBlock
                title="Cursor"
                subtitle="~/.cursor/mcp.json"
                tabs={[
                  {
                    label: "JSON",
                    language: "json",
                    code: `{
  "mcpServers": {
    "capi": {
      "command": "npx",
      "args": ["-y", "@capi.ai/mcp"],
      "env": { "CAPI_API_KEY": "capi_sk_live_..." }
    }
  }
}`,
                  },
                ]}
              />
              <FeatureGrid items={safety} columns={2} />
            </div>
          </div>
        </Section>
      </div>

      <div className="section-rule">
        <Section>
          <SectionHeading
            eyebrow="Explore"
            title="Related developer tools"
          />
          <FeatureGrid
            className="mt-9"
            items={[
              { icon: Terminal, title: "CLI", body: "The same surface from your terminal, with JSON-first output.", href: "/cli" },
              { icon: Boxes, title: "SDKs", body: "Six languages, full type definitions, built-in task polling.", href: "/sdk" },
              { icon: ListTree, title: "Agent Skills", body: "Package the workflow around the models for consistent output.", href: "/skills" },
              { icon: Search, title: "Model Catalog", body: "Browse every model with pricing and code samples.", href: "/models" },
            ]}
            columns={4}
          />
        </Section>
      </div>

      <ClosingCta
        title="Give your agent a browser and a studio"
        description="Install the MCP server and your coding agent can generate video, images, music, and speech on request."
        secondary={{ label: "MCP docs", href: "/docs/resources/mcp" }}
      />
    </>
  );
}

export const dynamic = "force-static";
