import { cn } from "@/lib/utils";

/**
 * Brand mark: a rounded blue tile holding a stylised "node + call" glyph.
 */
export function BrandMark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex size-6 items-center justify-center rounded-[5px] bg-brand",
        className,
      )}
      aria-hidden="true"
    >
      <svg viewBox="0 0 20 20" fill="none" className="size-4">
        <path
          d="M5.2 6.6v6.8c0 .9.8 1.6 1.7 1.6h3.4"
          stroke="white"
          strokeWidth="1.7"
          strokeLinecap="round"
        />
        <path
          d="M14.8 6.6v6.8c0 .9-.8 1.6-1.7 1.6"
          stroke="white"
          strokeWidth="1.7"
          strokeLinecap="round"
        />
        <circle cx="14.8" cy="6" r="1.7" fill="white" />
        <circle cx="5.2" cy="6" r="1.7" fill="white" />
      </svg>
    </span>
  );
}

export function Logo({
  className,
  markClassName,
  wordClassName,
}: {
  className?: string;
  markClassName?: string;
  wordClassName?: string;
}) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <BrandMark className={markClassName} />
      <span
        className={cn(
          "text-[17px] font-semibold tracking-[-0.02em] text-foreground",
          wordClassName,
        )}
      >
CAPI
      </span>
    </span>
  );
}

/**
 * Deterministic geometric provider mark — stands in for third-party brand
 * logos without reproducing them.
 */
const providerPalette: Record<string, [string, string]> = {
  OpenAI: ["#0f172a", "#10a37f"],
  Anthropic: ["#0f172a", "#d97757"],
  Google: ["#1a73e8", "#4285f4"],
  DeepSeek: ["#4d6bfe", "#1e40af"],
  Alibaba: ["#ff6a00", "#ff8f1f"],
  Bytedance: ["#325ab4", "#00c8d2"],
  "Black Forest Labs": ["#111827", "#6b7280"],
  MiniMax: ["#1e293b", "#ef4444"],
  xAI: ["#111827", "#000000"],
  Midjourney: ["#1f2937", "#0ea5e9"],
  Runway: ["#111827", "#22c55e"],
  ElevenLabs: ["#111827", "#000000"],
  "Fish Audio": ["#0ea5e9", "#22d3ee"],
  Ideogram: ["#7c3aed", "#a855f7"],
  Kuaishou: ["#ff5000", "#ff8f1f"],
  Luma: ["#0f766e", "#14b8a6"],
  "MeiGen-AI": ["#db2777", "#f472b6"],
  "Moonshot AI": ["#1e293b", "#6366f1"],
  PixVerse: ["#ec4899", "#f472b6"],
  Producer: ["#111827", "#a3a3a3"],
  Recraft: ["#0f172a", "#38bdf8"],
  Suno: ["#111827", "#f97316"],
  Topaz: ["#111827", "#0ea5e9"],
  Xiaomi: ["#ff6900", "#ff9f1c"],
  "Z.ai": ["#1e40af", "#3b82f6"],
};

export function ProviderMark({
  provider,
  className,
}: {
  provider: string;
  className?: string;
}) {
  const [fg, accent] = providerPalette[provider] ?? ["#0f172a", "#64748b"];
  const initials = provider
    .split(/[\s-]/)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();

  return (
    <span
      className={cn(
        "relative inline-flex size-7 items-center justify-center rounded-[5px] border border-border bg-white",
        className,
      )}
      aria-hidden="true"
    >
      <span
        className="text-[10px] font-semibold tracking-tight"
        style={{ color: fg }}
      >
        {initials}
      </span>
      <span
        className="absolute -right-0.5 -bottom-0.5 size-1.5 rounded-full"
        style={{ backgroundColor: accent }}
      />
    </span>
  );
}
