import Link from "next/link";

import { CodeBlock } from "@/components/code-block";
import type { CodeTab } from "@/components/code-block";
import { ProviderMark } from "@/components/logo";
import { ModelCatalog } from "@/components/models/model-catalog";
import { Button } from "@/components/ui/button";
import { endpointSnippets } from "@/lib/models-data";
import { site } from "@/lib/site";

const heroTabs: CodeTab[] = [
  {
    label: "REST API",
    language: "bash",
    code: `# Available Endpoints

POST   /v1/chat/completions         # LLM
POST   /v1/images/generations       # Image
POST   /api/v1/kling/text_to_video  # Video
POST   /v1/audio/speech             # TTS
POST   /v1/audio/transcriptions     # STT
POST   /v1/suno/text_to_music       # Music`,
  },
  {
    label: "NODE.JS",
    language: "javascript",
    code: `import { Capi } from "@capi.ai/sdk";

const capi = new Capi();

const image = await capi.image.generate({
  model: "gpt-image-2-text-to-image",
  prompt: "A lighthouse at dusk",
});

console.log(image.data[0].url);`,
  },
  {
    label: "PYTHON",
    language: "python",
    code: `from capi import Capi

capi = Capi()

image = capi.image.generate(
    model="gpt-image-2-text-to-image",
    prompt="A lighthouse at dusk",
)

print(image.data[0].url)`,
  },
  {
    label: "PHP",
    language: "php",
    code: `$capi = new \\Capi\\Client();

$image = $capi->image->generate([
    "model" => "gpt-image-2-text-to-image",
    "prompt" => "A lighthouse at dusk",
]);

echo $image->data[0]->url;`,
  },
  {
    label: "GO",
    language: "go",
    code: `capi := capi.NewClient()

image, err := capi.Image.Generate(ctx, capi.ImageRequest{
    Model:  "gpt-image-2-text-to-image",
    Prompt: "A lighthouse at dusk",
})
if err != nil {
    log.Fatal(err)
}
fmt.Println(image.Data[0].URL)`,
  },
  {
    label: "CLI",
    language: "bash",
    code: `capi image generate \\
  --model gpt-image-2-text-to-image \\
  --prompt "A lighthouse at dusk" \\
  --json`,
  },
];

const marquee = [
  "ElevenLabs",
  "Kling",
  "GPT Image 2",
  "Veo 3.1",
  "Hailuo",
  "Luma",
  "PixVerse",
  "Recraft",
  "Fish Audio",
];

export default async function ModelsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const raw = params.modality;
  const initialModality =
    typeof raw === "string" && raw.length > 0 ? raw : "all";

  return (
    <>
      <section className="py-14">
        <div className="container-page grid items-start gap-12 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
          <div className="pt-2">
            <span className="eyebrow-solid">Model Catalog</span>
            <h1 className="display-1 mt-5 text-foreground">
              Explore {site.modelCount} AI Models
            </h1>
            <p className="mt-5 max-w-md text-[15px] leading-relaxed text-muted-foreground">
              Browse, compare, and integrate the best AI models for video,
              image, music, audio, and text generation — all through one unified
              API.
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-5">
              <Button asChild variant="brand" size="lg" className="uppercase">
                <Link href="/signup">Get API Key</Link>
              </Button>
              <Link
                href="/docs"
                className="font-mono text-[11px] tracking-wider text-muted-foreground uppercase underline-offset-4 hover:text-foreground hover:underline"
              >
                Read the docs
              </Link>
            </div>

            <p className="mt-7 flex items-center gap-2 font-mono text-[11px] text-muted-foreground">
              <span className="size-1.5 rounded-full bg-emerald-500" />
              All models available · Real-time pricing
            </p>
          </div>

          <CodeBlock tabs={heroTabs} label="REST API" />
        </div>
      </section>

      <div className="section-rule">
        <div className="container-page py-8">
          <p className="text-center font-mono text-[10px] tracking-[0.14em] text-muted-foreground uppercase">
            Leading AI models, one API
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-x-8 gap-y-4">
            {marquee.map((name) => (
              <span
                key={name}
                className="flex items-center gap-2 text-[13px] font-medium text-muted-foreground/80"
              >
                <ProviderMark provider={name} className="size-5 border-0" />
                {name}
              </span>
            ))}
          </div>
        </div>
      </div>

      <ModelCatalog initialModality={initialModality} />

      <section className="section-rule">
        <div className="container-page py-14">
          <h2 className="display-3 text-foreground">
            Not sure which model to pick?
          </h2>
          <p className="mt-3 max-w-xl text-[14px] leading-relaxed text-muted-foreground">
            Every model page lists the exact model IDs, per-unit pricing, and a
            runnable request you can copy. Compare outputs side by side in the{" "}
            <Link href="/playground" className="text-brand underline-offset-4 hover:underline">
              playground
            </Link>
            .
          </p>
          <div className="mt-7 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {endpointSnippets.slice(0, 3).map((endpoint) => (
              <div
                key={endpoint.path}
                className="flex items-center gap-3 rounded-md border border-border bg-card px-4 py-3"
              >
                <span className="rounded-[3px] bg-muted px-1.5 py-0.5 font-mono text-[10px] font-medium text-muted-foreground">
                  {endpoint.method}
                </span>
                <span className="truncate font-mono text-[12px] text-foreground">
                  {endpoint.path}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
