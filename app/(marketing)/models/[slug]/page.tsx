import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight, Check } from "lucide-react";
import type { Metadata } from "next";

import { CodeBlock } from "@/components/code-block";
import type { CodeTab } from "@/components/code-block";
import { ProviderMark } from "@/components/logo";
import { ModelCard } from "@/components/models/model-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  getModel,
  modalityMeta,
  models,
  modelsByModality,
  type ModelEntry,
} from "@/lib/models-data";

export function generateStaticParams() {
  return models.map((model) => ({ slug: model.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const model = getModel(slug);
  if (!model) return { title: "Model not found" };

  return {
    title: `${model.name} API`,
    description: model.tagline,
  };
}

const badgeVariantMap = {
  text: "text",
  image: "image",
  video: "video",
  audio: "audio",
  utility: "utility",
} as const;

function codeTabsFor(model: ModelEntry): CodeTab[] {
  const id = model.variants[0]?.id ?? model.slug;

  if (model.modality === "text") {
    return [
      {
        label: "Python",
        language: "python",
        code: `from capi import Capi

client = Capi()

response = client.chat.completions.create(
    model="${id}",
    messages=[
        {"role": "user", "content": "Explain vector databases simply."}
    ],
)

print(response.choices[0].message.content)`,
      },
      {
        label: "Node.js",
        language: "javascript",
        code: `import { Capi } from "@capi.ai/sdk";

const client = new Capi();

const response = await client.chat.completions.create({
  model: "${id}",
  messages: [{ role: "user", content: "Explain vector databases simply." }],
});

console.log(response.choices[0].message.content);`,
      },
      {
        label: "cURL",
        language: "bash",
        code: `curl https://capi.ai/api/v1/chat/completions \\
  -H "Authorization: Bearer YOUR_API_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "${id}",
    "messages": [{"role": "user", "content": "Hello"}]
  }'`,
      },
    ];
  }

  if (model.modality === "image") {
    return [
      {
        label: "Python",
        language: "python",
        code: `from capi import Capi

client = Capi()

image = client.image.generate(
    model="${id}",
    prompt="A lighthouse at dusk, long exposure",
    size="1024x1024",
)

print(image.data[0].url)`,
      },
      {
        label: "Node.js",
        language: "javascript",
        code: `import { Capi } from "@capi.ai/sdk";

const client = new Capi();

const image = await client.image.generate({
  model: "${id}",
  prompt: "A lighthouse at dusk, long exposure",
  size: "1024x1024",
});

console.log(image.data[0].url);`,
      },
      {
        label: "cURL",
        language: "bash",
        code: `curl -X POST https://capi.ai/api/v1/images/generations \\
  -H "Authorization: Bearer YOUR_API_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{"model":"${id}","prompt":"A lighthouse at dusk"}'`,
      },
    ];
  }

  if (model.modality === "music") {
    return [
      {
        label: "Python",
        language: "python",
        code: `from capi import Capi

client = Capi()

task = client.music.generate(
    model="${id}",
    prompt="Warm indie folk about wide open skies",
)

result = task.wait()
print(result.audio_url)`,
      },
      {
        label: "cURL",
        language: "bash",
        code: `curl -X POST https://capi.ai/api/v1/suno/text_to_music \\
  -H "Authorization: Bearer YOUR_API_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{"model":"${id}","prompt":"Warm indie folk"}'`,
      },
    ];
  }

  if (model.modality === "audio") {
    return [
      {
        label: "Python",
        language: "python",
        code: `from capi import Capi

client = Capi()

audio = client.audio.speech.create(
    model="${id}",
    input="Welcome to Capi.",
    voice="alloy",
)

with open("out.mp3", "wb") as f:
    f.write(audio.content)`,
      },
      {
        label: "cURL",
        language: "bash",
        code: `curl -X POST https://capi.ai/api/v1/audio/speech \\
  -H "Authorization: Bearer YOUR_API_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{"model":"${id}","input":"Welcome to Capi."}' \\
  --output out.mp3`,
      },
    ];
  }

  if (model.modality === "utility") {
    return [
      {
        label: "Python",
        language: "python",
        code: `from capi import Capi

client = Capi()

task = client.video.edit(
    model="${id}",
    video_url="https://file.capi.ai/input.mp4",
)

print(task.wait().videos[0].url)`,
      },
      {
        label: "cURL",
        language: "bash",
        code: `curl -X POST https://capi.ai/api/v1/topaz/video_upscale \\
  -H "Authorization: Bearer YOUR_API_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{"model":"${id}","video_url":"https://file.capi.ai/input.mp4"}'`,
      },
    ];
  }

  // video
  return [
    {
      label: "Python",
      language: "python",
      code: `from capi import Capi

client = Capi()

task = client.video.generate(
    model="${id}",
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
  model: "${id}",
  prompt: "A paper kite flying above a quiet coastal town at sunrise",
  duration_seconds: 5,
});

console.log((await task.wait()).videos[0].url);`,
    },
    {
      label: "cURL",
      language: "bash",
      code: `curl -X POST https://capi.ai/api/v1/kling/text_to_video \\
  -H "Authorization: Bearer YOUR_API_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "${id}",
    "prompt": "A paper kite flying above a quiet coastal town at sunrise",
    "duration_seconds": 5
  }'`,
    },
  ];
}

export default async function ModelDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const model = getModel(slug);

  if (!model) notFound();

  const meta = modalityMeta[model.modality];
  const related = modelsByModality(model.modality)
    .filter((m) => m.slug !== model.slug)
    .slice(0, 3);

  return (
    <>
      <section className="border-b border-border">
        <div className="container-page py-10">
          <div className="flex items-center gap-2 font-mono text-[11px] text-muted-foreground">
            <Link
              href="/models"
              className="flex items-center gap-1.5 transition-colors hover:text-foreground"
            >
              <ArrowLeft className="size-3" />
              Models
            </Link>
            <span className="text-neutral-300">/</span>
            <span className="text-foreground">{model.name}</span>
          </div>

          <div className="mt-6 flex flex-wrap items-start justify-between gap-6">
            <div>
              <div className="flex items-center gap-3">
                <ProviderMark provider={model.provider} className="size-9" />
                <Badge
                  variant={badgeVariantMap[meta.badgeVariant as keyof typeof badgeVariantMap]}
                >
                  {model.badge}
                </Badge>
              </div>

              <h1 className="display-1 mt-5 text-foreground">{model.name}</h1>
              <p className="mt-2 font-mono text-[12px] text-muted-foreground">
                by {model.provider}
              </p>
              <p className="mt-5 max-w-2xl text-[15px] leading-relaxed text-muted-foreground">
                {model.tagline}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <Button asChild variant="brand" size="lg" className="uppercase">
                <Link href="/signup">Get API Key</Link>
              </Button>
              <Button asChild variant="outline" size="lg" className="uppercase">
                <Link href="/docs">Read the docs</Link>
              </Button>
            </div>
          </div>
        </div>
      </section>

      <div className="container-page grid items-start gap-12 py-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.95fr)]">
        <div className="flex flex-col gap-10">
          <div>
            <h2 className="text-[15px] font-semibold tracking-tight text-foreground">
              Capabilities
            </h2>
            <ul className="mt-4 grid gap-2.5 sm:grid-cols-2">
              {model.capabilities.map((capability) => (
                <li
                  key={capability}
                  className="flex items-center gap-2 text-[13px] text-muted-foreground"
                >
                  <Check className="size-3.5 text-brand" />
                  {capability}
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h2 className="text-[15px] font-semibold tracking-tight text-foreground">
              Available models
            </h2>
            <p className="mt-1.5 text-[13px] text-muted-foreground">
              Pass any of these IDs in the{" "}
              <code className="rounded-[4px] border border-border bg-muted px-1.5 py-0.5 font-mono text-[12px]">
                model
              </code>{" "}
              field.
            </p>

            <div className="mt-5 overflow-hidden rounded-md border border-border">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40 hover:bg-muted/40">
                    <TableHead>Model ID</TableHead>
                    <TableHead>Detail</TableHead>
                    <TableHead>Price</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {model.variants.map((variant) => (
                    <TableRow key={variant.id}>
                      <TableCell className="font-mono text-[12px] text-foreground">
                        {variant.id}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {variant.detail ?? "—"}
                      </TableCell>
                      <TableCell className="font-mono text-[12px] text-muted-foreground">
                        {variant.price}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>

          <div className="rounded-md border border-border bg-muted/40 p-5">
            <p className="font-mono text-[11px] tracking-wider text-muted-foreground uppercase">
              Pricing starts at
            </p>
            <p className="mt-2 text-[15px] font-semibold text-foreground">
              from ${model.priceFrom.amount} / {model.priceFrom.unit}
            </p>
            <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
              Pay only for what you use. Each response returns the exact amount
              settled against your balance — no subscriptions, no minimums.
            </p>
          </div>
        </div>

        <div className="lg:sticky lg:top-32">
          <CodeBlock
            tabs={codeTabsFor(model)}
            title="Quickstart"
            subtitle={`${model.name} · ${model.variants[0]?.id ?? model.slug}`}
          />
        </div>
      </div>

      {related.length > 0 ? (
        <div className="section-rule">
          <div className="container-page py-12">
            <div className="flex items-center justify-between">
              <h2 className="display-3 text-foreground">
                More {meta.label.toLowerCase()} models
              </h2>
              <Link
                href={`/models?modality=${model.modality}`}
                className="flex items-center gap-1 text-[13px] font-medium text-brand underline-offset-4 hover:underline"
              >
                View all
                <ArrowRight className="size-3.5" />
              </Link>
            </div>
            <div className="mt-7 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {related.map((item) => (
                <ModelCard key={item.slug} model={item} />
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
