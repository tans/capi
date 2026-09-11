import Link from "next/link";
import { Play } from "lucide-react";

import { CodeBlock } from "@/components/code-block";
import type { CodeTab } from "@/components/code-block";

const modalities = [
  {
    name: "Video",
    accent: "#3b82f6",
    items: ["Kling, Seedance,", "HappyHorse, Veo 3.1"],
    count: 78,
    href: "/models?modality=video",
  },
  {
    name: "Image",
    accent: "#22d3ee",
    items: ["GPT Image 2, Nano", "Banana, Seedream,", "Qwen Image"],
    count: 51,
    href: "/models?modality=image",
  },
  {
    name: "Music",
    accent: "#22c55e",
    items: ["Suno, Producer"],
    count: 14,
    href: "/models?modality=music",
  },
  {
    name: "Audio",
    accent: "#f97316",
    items: ["ElevenLabs, Fish Audio,", "Gemini TTS, OpenAI TTS"],
    count: 21,
    href: "/models?modality=audio",
  },
  {
    name: "LLM",
    accent: "#8b5cf6",
    items: ["Claude, GPT, Gemini,", "DeepSeek"],
    count: 66,
    href: "/models?modality=text",
  },
];

function Modalities() {
  return (
    <div className="py-16 sm:py-20">
      <div className="container-page">
        <h2 className="display-2 max-w-2xl text-white">
          One API for Every AI Model
        </h2>
        <p className="mt-4 max-w-md text-[15px] leading-relaxed text-ink-muted">
          Three lines of code to generate a video, create music, or produce an
          image.
        </p>

        <div className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {modalities.map((m) => (
            <Link
              key={m.name}
              href={m.href}
              className="group flex flex-col rounded-md border border-ink-border bg-ink-soft transition-colors hover:border-neutral-700"
            >
              <span
                aria-hidden="true"
                className="h-[3px] w-10 rounded-full"
                style={{ backgroundColor: m.accent }}
              />
              <div className="flex flex-1 flex-col p-5 pt-4">
                <h3 className="text-[15px] font-semibold tracking-tight text-white">
                  {m.name}
                </h3>
                <p className="mt-3 flex-1 text-[13px] leading-relaxed text-ink-muted">
                  {m.items.map((line) => (
                    <span key={line} className="block">
                      {line}
                    </span>
                  ))}
                </p>
                <p className="mt-5 font-mono text-[11px] tracking-wider text-ink-muted">
                  {m.count} models
                </p>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}

function PlaygroundPreview() {
  return (
    <div className="border-t border-ink-border py-16 sm:py-20">
      <div className="container-page">
        <span className="eyebrow-brand">Try Capi</span>
        <h2 className="display-2 mt-4 text-white">Playground</h2>

        <div className="mt-8 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.85fr)]">
          {/* Controls — presentational only, no generation is wired up. */}
          <div className="rounded-md border border-ink-border bg-ink-soft p-4 sm:p-5">
            <div className="flex flex-wrap items-center gap-1">
              {["VIDEO", "IMAGE", "MUSIC", "AUDIO", "LLM"].map((tab, i) => (
                <span
                  key={tab}
                  className={
                    i === 0
                      ? "rounded-[3px] bg-brand px-3 py-1.5 font-mono text-[11px] tracking-wide text-white"
                      : "rounded-[3px] px-3 py-1.5 font-mono text-[11px] tracking-wide text-ink-muted"
                  }
                >
                  {tab}
                </span>
              ))}
            </div>

            <div className="mt-6 flex flex-col gap-5">
              <div>
                <p className="font-mono text-[10px] tracking-[0.12em] text-ink-muted uppercase">
                  Model
                </p>
                <div className="mt-2 flex items-center justify-between rounded-sm border border-ink-border px-3 py-2.5 text-[13px] text-white">
                  Kling v2.1
                  <span className="text-ink-muted">▾</span>
                </div>
              </div>

              <div>
                <p className="font-mono text-[10px] tracking-[0.12em] text-ink-muted uppercase">
                  Prompt
                </p>
                <div className="mt-2 min-h-24 rounded-sm border border-ink-border px-3 py-2.5 text-[13px] text-ink-muted">
                  Describe what you want to create...
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="font-mono text-[10px] tracking-[0.12em] text-ink-muted uppercase">
                    Duration
                  </p>
                  <div className="mt-2 flex items-center gap-1">
                    <span className="rounded-[3px] border border-ink-border px-3 py-1.5 text-[12px] text-white">
                      5s
                    </span>
                    <span className="rounded-[3px] px-3 py-1.5 text-[12px] text-ink-muted">
                      10s
                    </span>
                  </div>
                </div>
                <div>
                  <p className="font-mono text-[10px] tracking-[0.12em] text-ink-muted uppercase">
                    Aspect ratio
                  </p>
                  <div className="mt-2 flex items-center gap-1">
                    <span className="rounded-[3px] border border-ink-border px-3 py-1.5 text-[12px] text-white">
                      16:9
                    </span>
                    <span className="rounded-[3px] px-3 py-1.5 text-[12px] text-ink-muted">
                      9:16
                    </span>
                    <span className="rounded-[3px] px-3 py-1.5 text-[12px] text-ink-muted">
                      1:1
                    </span>
                  </div>
                </div>
              </div>

              <p className="font-mono text-[11px] text-ink-muted">
                Estimated:{" "}
                <span className="text-white">$0.61 / second</span>
              </p>

              <div className="rounded-sm bg-brand py-3 text-center text-[12px] font-medium tracking-wider text-white uppercase">
                Generate
              </div>
              <p className="text-center text-[11px] text-ink-muted">
                Sign in to generate with Capi.{" "}
                <Link href="/login" className="text-white underline-offset-4 hover:underline">
                  Sign in
                </Link>
              </p>
            </div>
          </div>

          {/* Result surface */}
          <div className="flex flex-col gap-3">
            <div className="flex flex-1 items-center justify-center rounded-md border border-ink-border bg-ink-soft">
              <span className="flex size-11 items-center justify-center rounded-full border border-ink-border">
                <Play className="size-4 text-ink-muted" />
              </span>
            </div>
            <p className="text-center text-[11px] text-ink-muted">
              Your result will appear here
            </p>
            <div className="grid grid-cols-3 gap-3">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className="aspect-video rounded-sm border border-ink-border bg-ink-soft"
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const endpointTabs: CodeTab[] = [
  {
    label: "endpoints",
    language: "plaintext",
    code: `POST   /api/v1/kling/text_to_video
GET    /api/v1/kling/text_to_video/{task_id}
POST   /v1/chat/completions
GET    /v1/me/balance`,
  },
  {
    label: "curl",
    language: "bash",
    code: `curl -X POST https://capi.ai/api/v1/kling/text_to_video \\
  -H "Authorization: Bearer YOUR_API_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{"model":"kling-v3-turbo-text-to-video","prompt":"A paper kite at sunrise"}'`,
  },
  {
    label: "Python",
    language: "python",
    code: `from capi import Capi

client = Capi()
task = client.video.generate(
    model="kling-v3-turbo-text-to-video",
    prompt="A paper kite at sunrise",
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
  prompt: "A paper kite at sunrise",
});
console.log((await task.wait()).videos[0].url);`,
  },
  {
    label: "Claude Code",
    language: "bash",
    code: `claude mcp add capi -- npx -y @capi.ai/mcp

# then ask Claude Code:
# "Generate a 5s video of a paper kite at sunrise"`,
  },
  {
    label: "Codex",
    language: "bash",
    code: `codex mcp add capi -- npx -y @capi.ai/mcp

# then ask Codex:
# "Create an image of a harbour at dawn"`,
  },
];

function Endpoints() {
  return (
    <div className="border-t border-ink-border py-16 sm:py-20">
      <div className="container-page">
        <h2 className="display-2 text-white">Start building in minutes</h2>
        <p className="mt-4 max-w-lg text-[15px] leading-relaxed text-ink-muted">
          Call the REST endpoint directly, use an SDK, or let your coding agent
          do it.
        </p>

        <CodeBlock tabs={endpointTabs} className="mt-8" />
      </div>
    </div>
  );
}

export function DarkSections() {
  return (
    <div className="bg-ink">
      <Modalities />
      <PlaygroundPreview />
      <Endpoints />
    </div>
  );
}
