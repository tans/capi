import Link from "next/link";

import { Button } from "@/components/ui/button";

const clients = ["Claude Code", "Codex", "Your App"];

const modelRows: { name: string; tag: string }[] = [
  { name: "Seedance 2.5", tag: "VIDEO" },
  { name: "Suno v5.5", tag: "MUSIC" },
  { name: "GPT Image 2", tag: "IMAGE" },
  { name: "Claude Opus 5", tag: "LLM" },
  { name: "Whisper v3", tag: "AUDIO" },
  { name: "Gemini 2.5 Pro", tag: "LLM" },
  { name: "GPT-5.6 Sol", tag: "LLM" },
];

/**
 * Diagram of the routing model: many clients, one key, many providers.
 * Drawn as a single SVG so the connector curves stay pixel-accurate at any
 * container width.
 */
function RoutingDiagram() {
  const rowGap = 46;
  const rowTop = 62;

  return (
    <svg
      viewBox="0 0 560 420"
      role="img"
      aria-label="Clients connect to Capi with one key, and Capi routes to 240+ models"
      className="h-auto w-full max-w-[560px]"
    >
      <defs>
        <linearGradient id="capi-fade" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#93c5fd" stopOpacity="0.9" />
          <stop offset="100%" stopColor="#93c5fd" stopOpacity="0.35" />
        </linearGradient>
      </defs>

      {/* ------------------------------- clients ------------------------------ */}
      <text
        x="20"
        y="46"
        fill="#a3a3a3"
        fontSize="8"
        fontFamily="var(--font-geist-mono)"
        letterSpacing="1.2"
      >
        CLIENTS
      </text>
      <rect
        x="128"
        y="34"
        width="42"
        height="16"
        rx="3"
        fill="#0a0a0a"
      />
      <text
        x="149"
        y="45"
        fill="#ffffff"
        fontSize="8"
        fontFamily="var(--font-geist-mono)"
        textAnchor="middle"
        letterSpacing="0.8"
      >
        1 KEY
      </text>

      {clients.map((client, i) => {
        const y = 62 + i * 60;
        return (
          <g key={client}>
            <rect
              x="20"
              y={y}
              width="150"
              height="46"
              rx="5"
              fill="#ffffff"
              stroke="#e5e5e5"
            />
            <rect x="32" y={y + 15} width="16" height="16" rx="4" fill="#f5f5f5" />
            <circle cx="40" cy={y + 23} r="3.5" fill="#d4d4d4" />
            <text
              x="58"
              y={y + 27}
              fill="#171717"
              fontSize="11"
              fontFamily="var(--font-geist-sans)"
            >
              {client}
            </text>
          </g>
        );
      })}

      {/* ------------------------------ connectors ---------------------------- */}
      {clients.map((client, i) => {
        const y = 62 + i * 60 + 23;
        return (
          <path
            key={`c-${client}`}
            d={`M170 ${y} C 195 ${y}, 195 172, 218 172`}
            fill="none"
            stroke="url(#capi-fade)"
            strokeWidth="1"
            strokeDasharray="3 3"
          />
        );
      })}

      {modelRows.map((row, i) => {
        const y = rowTop + i * rowGap + 18;
        return (
          <path
            key={`m-${row.name}`}
            d={`M336 172 C 362 172, 362 ${y}, 396 ${y}`}
            fill="none"
            stroke="url(#capi-fade)"
            strokeWidth="1"
            strokeDasharray="3 3"
          />
        );
      })}

      {/* -------------------------------- capi -------------------------------- */}
      <rect
        x="218"
        y="148"
        width="118"
        height="48"
        rx="6"
        fill="#ffffff"
        stroke="#bfdbfe"
        strokeWidth="1.5"
      />
      <rect x="232" y="164" width="18" height="18" rx="5" fill="#2563eb" />
      <path
        d="M237.5 169.5v7.2c0 .8.7 1.5 1.5 1.5h3.2M246.5 169.5v7.2c0 .8-.7 1.5-1.5 1.5"
        stroke="#ffffff"
        strokeWidth="1.4"
        strokeLinecap="round"
        fill="none"
      />
      <circle cx="246.5" cy="169" r="1.5" fill="#ffffff" />
      <circle cx="237.5" cy="169" r="1.5" fill="#ffffff" />
      <text
        x="258"
        y="177"
        fill="#0a0a0a"
        fontSize="13"
        fontWeight="600"
        fontFamily="var(--font-geist-sans)"
      >
        Capi
      </text>

      <text
        x="277"
        y="216"
        fill="#a3a3a3"
        fontSize="7"
        fontFamily="var(--font-geist-mono)"
        textAnchor="middle"
        letterSpacing="0.8"
      >
        MORE STABLE
      </text>
      <text
        x="277"
        y="227"
        fill="#a3a3a3"
        fontSize="7"
        fontFamily="var(--font-geist-mono)"
        textAnchor="middle"
        letterSpacing="0.8"
      >
        LOWER COST
      </text>

      {/* -------------------------------- models ------------------------------ */}
      <text
        x="396"
        y="46"
        fill="#a3a3a3"
        fontSize="8"
        fontFamily="var(--font-geist-mono)"
        letterSpacing="1.2"
      >
        MODELS
      </text>
      <rect x="500" y="34" width="42" height="16" rx="3" fill="#2563eb" />
      <text
        x="521"
        y="45"
        fill="#ffffff"
        fontSize="8"
        fontFamily="var(--font-geist-mono)"
        textAnchor="middle"
        letterSpacing="0.8"
      >
        240+
      </text>

      {modelRows.map((row, i) => {
        const y = rowTop + i * rowGap;
        return (
          <g key={row.name}>
            <rect
              x="396"
              y={y}
              width="146"
              height="36"
              rx="5"
              fill="#ffffff"
              stroke="#e5e5e5"
            />
            <rect x="406" y={y + 11} width="14" height="14" rx="3" fill="#eff6ff" />
            <circle cx="413" cy={y + 18} r="2.5" fill="#93c5fd" />
            <text
              x="428"
              y={y + 22}
              fill="#171717"
              fontSize="10"
              fontFamily="var(--font-geist-sans)"
            >
              {row.name}
            </text>
            <text
              x="532"
              y={y + 22}
              fill="#c4c4c4"
              fontSize="7"
              fontFamily="var(--font-geist-mono)"
              textAnchor="end"
              letterSpacing="0.6"
            >
              {row.tag}
            </text>
          </g>
        );
      })}

      <text
        x="396"
        y="400"
        fill="#a3a3a3"
        fontSize="9"
        fontFamily="var(--font-geist-mono)"
      >
        +233 models
      </text>
    </svg>
  );
}

export function Hero() {
  return (
    <section className="overflow-hidden">
      <div className="container-page grid items-center gap-14 py-16 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:py-24">
        <div>
          <p className="eyebrow">Unified AI API Platform</p>
          <h1 className="display-1 mt-5 max-w-xl text-foreground">
            Unified AI API for{" "}
            <span className="text-brand">Video, Music, Image</span> &amp; LLMs
          </h1>
          <p className="mt-6 max-w-lg text-[15px] leading-relaxed text-muted-foreground">
            One API key for 240+ AI models: video, image, music and LLM APIs.
            Use Claude Code, Codex and Cursor. Pay as you go.
          </p>

          <div className="mt-9 flex flex-wrap items-center gap-5">
            <Button asChild size="xl">
              <Link href="/dashboard">Open Dashboard</Link>
            </Button>
            <Link
              href="/contact"
              className="text-[13px] text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
            >
              Enterprise?
            </Link>
          </div>
        </div>

        <div className="flex justify-center lg:justify-end">
          <RoutingDiagram />
        </div>
      </div>
    </section>
  );
}
