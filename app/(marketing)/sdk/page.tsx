import type { Metadata } from "next";
import { Boxes, FileCode2, Gauge, Repeat } from "lucide-react";

import { CodeBlock } from "@/components/code-block";
import {
  ClosingCta,
  FeatureGrid,
  PageHero,
  Section,
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
  title: "SDKs",
  description:
    "Official Capi SDKs for Python, Node.js, PHP, Java, Ruby, and Go with full type definitions.",
};

const languages = [
  { title: "Python", body: "Sync and asyncio clients, built-in task polling.", meta: "pip install capi" },
  { title: "Node.js", body: "ESM and CJS builds with TypeScript declarations.", meta: "npm i @capi.ai/sdk" },
  { title: "Go", body: "Context-aware client with typed requests and responses.", meta: "go get github.com/capi-ai/capi-go" },
  { title: "PHP", body: "PSR-18 compatible HTTP client.", meta: "composer require capi-ai/sdk" },
  { title: "Ruby", body: "Idiomatic client with keyword arguments.", meta: "gem install capi" },
  { title: "Java", body: "Maven and Gradle artefacts, builder-style requests.", meta: "ai.capi:capi-java" },
];

const options = [
  { name: "api_key", type: "string", body: "Reads CAPI_API_KEY when omitted." },
  { name: "base_url", type: "string", body: "Point at a proxy or a mock server." },
  { name: "timeout", type: "number", body: "Per-request timeout in seconds." },
  { name: "max_retries", type: "number", body: "Retries on 429 and 5xx with backoff." },
  { name: "poll_interval", type: "number", body: "Initial wait() poll interval." },
];

export default function SdkPage() {
  return (
    <>
      <PageHero
        eyebrow="SDKs"
        title="SDKs for every stack"
        description="Official clients for six languages. Each one wraps the REST API, adds typed errors, and handles async task polling so you never write a retry loop."
        primary={{ label: "Get API Key", href: "/signup" }}
        secondary={{ label: "Read the docs", href: "/docs/resources/sdks" }}
        code={
          <CodeBlock
            tabs={[
              {
                label: "Python",
                language: "python",
                code: `from capi import Capi

client = Capi()

task = client.video.generate(
    model="kling-v3-turbo-text-to-video",
    prompt="A paper kite above a coastal town at sunrise",
)

print(task.wait().videos[0].url)`,
              },
              {
                label: "Node.js",
                language: "javascript",
                code: `import { Capi } from "@capi.ai/sdk";

const client = new Capi();

const task = await client.video.generate({
  model: "kling-v3-turbo-text-to-video",
  prompt: "A paper kite above a coastal town at sunrise",
});

console.log((await task.wait()).videos[0].url);`,
              },
              {
                label: "Go",
                language: "go",
                code: `client := capi.NewClient()

task, err := client.Video.Generate(ctx, capi.VideoRequest{
    Model:  "kling-v3-turbo-text-to-video",
    Prompt: "A paper kite above a coastal town at sunrise",
})
if err != nil {
    log.Fatal(err)
}

result, _ := task.Wait(ctx)
fmt.Println(result.Videos[0].URL)`,
              },
            ]}
          />
        }
      />

      <Section>
        <SectionHeading
          eyebrow="Languages"
          title="Six clients, one shape"
          description="A client, per-modality namespaces, typed errors, and a wait() helper. Learn one and you know them all."
        />
        <FeatureGrid className="mt-9" items={languages} columns={3} />
      </Section>

      <div className="section-rule">
        <Section>
          <div className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
            <div>
              <SectionHeading eyebrow="Configuration" title="Client options" />
              <div className="mt-8 overflow-hidden rounded-md border border-border">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/40 hover:bg-muted/40">
                      <TableHead>Option</TableHead>
                      <TableHead>Behaviour</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {options.map((option) => (
                      <TableRow key={option.name}>
                        <TableCell className="font-mono text-[12px] whitespace-normal text-foreground">
                          {option.name}
                        </TableCell>
                        <TableCell className="whitespace-normal text-muted-foreground">
                          {option.body}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <FeatureGrid
                className="mt-8"
                columns={2}
                items={[
                  {
                    icon: Boxes,
                    title: "Typed errors",
                    body: "One exception hierarchy across languages, carrying status, code, and the provider message.",
                  },
                  {
                    icon: Repeat,
                    title: "Automatic retries",
                    body: "429 and 5xx responses retry with exponential backoff and respect Retry-After.",
                  },
                  {
                    icon: FileCode2,
                    title: "Full type definitions",
                    body: "Responses are typed end to end, so editors autocomplete model IDs and parameters.",
                  },
                  {
                    icon: Gauge,
                    title: "Streaming support",
                    body: "LLM routes stream token deltas without buffering at the SDK layer.",
                  },
                ]}
              />
            </div>

            <div className="flex flex-col gap-4">
              <CodeBlock
                title="Error handling"
                subtitle="Python"
                tabs={[
                  {
                    label: "Python",
                    language: "python",
                    code: `from capi import Capi, CapiError, RateLimitError, TaskFailedError

client = Capi()

try:
    task = client.video.generate(
        model="kling-v3-turbo-text-to-video",
        prompt="A paper kite above a coastal town at sunrise",
    )
    result = task.wait()
except RateLimitError as e:
    print("retry after", e.retry_after)
except TaskFailedError as e:
    print(e.code, e.message)
except CapiError as e:
    print(e.status, e.message)`,
                  },
                ]}
              />
              <CodeBlock
                title="Drop-in OpenAI compatibility"
                subtitle="Python"
                tabs={[
                  {
                    label: "Python",
                    language: "python",
                    code: `from openai import OpenAI

# Only the base URL and key change.
client = OpenAI(
    base_url="https://capi.ai/api/v1",
    api_key="YOUR_API_TOKEN",
)

response = client.chat.completions.create(
    model="claude-opus-5",
    messages=[{"role": "user", "content": "Hello"}],
)`,
                  },
                ]}
              />
            </div>
          </div>
        </Section>
      </div>

      <ClosingCta
        title="Install the SDK and ship"
        description="Six languages, one API surface, and task helpers so you can focus on the product rather than the plumbing."
        secondary={{ label: "SDK docs", href: "/docs/resources/sdks" }}
      />
    </>
  );
}

export const dynamic = "force-static";
