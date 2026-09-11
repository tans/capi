import Link from "next/link";
import { Boxes, ShieldCheck, Tags, Terminal } from "lucide-react";

import { CodeBlock, CodeResponse, CommandStrip } from "@/components/code-block";
import { Section } from "@/components/section";
import { Button } from "@/components/ui/button";
import type { CodeTab } from "@/components/code-block";

const requestTabs: CodeTab[] = [
  {
    label: "cURL",
    language: "bash",
    code: `curl -X POST https://capi.ai/api/v1/kling/text_to_video \\
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
  {
    label: "Python",
    language: "python",
    code: `from capi import Capi

client = Capi()
task = client.video.generate(
    model="kling-v3-turbo-text-to-video",
    prompt="A paper kite flying above a quiet coastal town at sunrise",
    duration_seconds=5,
)
result = task.wait()
print(result.videos[0].url)`,
  },
  {
    label: "Node.js",
    language: "javascript",
    code: `import { Capi } from "@capi.ai/sdk";

const client = new Capi();
const task = await client.video.generate({
  model: "kling-v3-turbo-text-to-video",
  prompt: "A paper kite flying above a quiet coastal town at sunrise",
  duration_seconds: 5,
});
const result = await task.wait();
console.log(result.videos[0].url);`,
  },
  {
    label: "Go",
    language: "go",
    code: `client := capi.NewClient()
task, err := client.Video.Generate(ctx, capi.VideoRequest{
    Model:    "kling-v3-turbo-text-to-video",
    Prompt:   "A paper kite flying above a quiet coastal town at sunrise",
    Duration: 5,
})
if err != nil {
    log.Fatal(err)
}
result, _ := task.Wait(ctx)
fmt.Println(result.Videos[0].URL)`,
  },
  {
    label: "PHP",
    language: "php",
    code: `$client = new \\Capi\\Client();

$task = $client->video->generate([
    "model" => "kling-v3-turbo-text-to-video",
    "prompt" => "A paper kite flying above a quiet coastal town at sunrise",
    "duration_seconds" => 5,
]);

$result = $task->wait();
echo $result->videos[0]->url;`,
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
      "url": "https://file.capi.ai/reference-video.mp4"
    }
  ]
}`;

const reasons = [
  {
    icon: Boxes,
    title: "All models, one API",
    body: "Access video, music, image, and LLM models through a single API key — including Suno (no official API available elsewhere) and Kling video generation.",
  },
  {
    icon: ShieldCheck,
    title: "Production ready",
    body: "Built for production workloads. Async task management, webhook callbacks, automatic retries, and predictable credit-based billing. SDKs in Python, Node.js, PHP, Java, Ruby, and Go.",
  },
  {
    icon: Tags,
    title: "Transparent pricing",
    body: "Pay only for what you use. No subscriptions, no hidden fees. See exactly what each generation costs before you call the API.",
  },
];

export function WhyDevelopers() {
  return (
    <Section>
      <div className="grid gap-12 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] lg:gap-16">
        <div>
          <h2 className="display-2 max-w-sm text-foreground">
            Why developers choose Capi
          </h2>
          <p className="mt-4 max-w-md text-[15px] leading-relaxed text-muted-foreground">
            The boring parts of multi-model AI infrastructure, handled.
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

const steps = [
  {
    n: "1",
    title: "Get an API Key",
    body: "Sign up and generate a free API key from the dashboard. No credit card required.",
  },
  {
    n: "2",
    title: "Pick a Model",
    body: "Browse the model catalog, choose by modality and provider, and copy the model ID.",
  },
  {
    n: "3",
    title: "Call the API",
    body: "Send a POST request with your prompt and model ID. Capi routes it to the provider, manages the async lifecycle, and returns structured JSON.",
  },
];

export function HowItWorks() {
  return (
    <div className="section-rule">
      <Section>
        <div className="flex flex-col items-center">
          <span className="eyebrow-solid">How it works</span>
          <h2 className="display-2 mt-5 text-center text-foreground">
            Three Steps to Your First Generation
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

const tools = [
  { name: "Claude Code", kind: "MCP + CLI", glyph: "CC" },
  { name: "Codex", kind: "MCP", glyph: "CX" },
  { name: "Gemini CLI", kind: "MCP", glyph: "GC" },
  { name: "Cursor", kind: "MCP", glyph: "CR" },
  { name: "Windsurf", kind: "MCP", glyph: "WS" },
  { name: "VS Code", kind: "Extension", glyph: "VS" },
];

export function DeveloperTools() {
  return (
    <Section>
      <h2 className="display-2 text-center text-foreground">Developer Tools</h2>

      <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {tools.map((tool) => (
          <div
            key={tool.name}
            className="flex flex-col items-center gap-3 rounded-md border border-border bg-card px-6 py-8 transition-colors hover:border-neutral-300"
          >
            <span className="flex size-9 items-center justify-center rounded-md bg-muted font-mono text-[11px] font-semibold text-foreground">
              {tool.glyph}
            </span>
            <span className="text-[14px] font-semibold tracking-tight text-foreground">
              {tool.name}
            </span>
            <span className="font-mono text-[10px] tracking-wider text-muted-foreground uppercase">
              {tool.kind}
            </span>
          </div>
        ))}
      </div>

      <div className="mt-10 flex flex-col items-center gap-5">
        <p className="max-w-xl text-center text-[13px] leading-relaxed text-muted-foreground">
          Give Claude Code, Codex, Gemini CLI, and other coding agents access to
          200+ models through MCP server or installable skills.
        </p>
        <CommandStrip command="npx -y @capi.ai/mcp" />
      </div>

      <div className="mt-8 flex justify-center">
        <Button asChild variant="outline">
          <Link href="/mcp" className="flex items-center gap-2">
            <Terminal className="size-4" />
            Explore developer tools
          </Link>
        </Button>
      </div>
    </Section>
  );
}
