import { cn } from "@/lib/utils";

/**
 * Dependency-free bar chart. Values are normalised against the maximum so the
 * chart works for any dataset without a charting library.
 */
export function BarChart({
  data,
  labels,
  className,
  accent = false,
}: {
  data: number[];
  labels?: string[];
  className?: string;
  accent?: boolean;
}) {
  const max = Math.max(...data, 1);

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <div className="flex h-40 items-end gap-1.5">
        {data.map((value, i) => {
          const pct = Math.max(2, Math.round((value / max) * 100));
          const isLast = i === data.length - 1;
          return (
            <div
              key={i}
              className="group relative flex-1"
              style={{ height: "100%" }}
            >
              <div className="flex h-full items-end">
                <div
                  className={cn(
                    "w-full rounded-[2px] transition-colors",
                    accent || isLast
                      ? "bg-brand"
                      : "bg-neutral-200 group-hover:bg-neutral-300",
                  )}
                  style={{ height: `${pct}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>

      {labels ? (
        <div className="flex gap-1.5">
          {labels.map((label, i) => (
            <span
              key={`${label}-${i}`}
              className="flex-1 text-center font-mono text-[9px] text-muted-foreground"
            >
              {label}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/** Horizontal breakdown bar used for per-model cost attribution. */
export function BreakdownBar({
  rows,
  className,
}: {
  rows: { label: string; value: number; display: string }[];
  className?: string;
}) {
  const max = Math.max(...rows.map((r) => r.value), 1);

  return (
    <div className={cn("flex flex-col gap-4", className)}>
      {rows.map((row) => (
        <div key={row.label}>
          <div className="flex items-center justify-between gap-3">
            <span className="truncate text-[13px] text-foreground">
              {row.label}
            </span>
            <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
              {row.display}
            </span>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-neutral-200">
            <div
              className="h-full rounded-full bg-brand"
              style={{ width: `${Math.round((row.value / max) * 100)}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Small inline sparkline for KPI cards. */
export function Sparkline({
  data,
  className,
}: {
  data: number[];
  className?: string;
}) {
  const max = Math.max(...data, 1);
  const min = Math.min(...data);
  const range = max - min || 1;
  const width = 100;
  const height = 28;

  const points = data
    .map((value, i) => {
      const x = (i / (data.length - 1)) * width;
      const y = height - ((value - min) / range) * height;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className={cn("h-7 w-full", className)}
      aria-hidden="true"
    >
      <polyline
        points={points}
        fill="none"
        stroke="var(--brand)"
        strokeWidth="1.5"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
