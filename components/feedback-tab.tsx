import { getDictionary } from "@/lib/i18n";
import type { Locale } from "@/lib/i18n/config";

export function FeedbackTab({
  label,
  locale,
}: {
  label?: string;
  locale?: Locale;
}) {
  const resolvedLabel = label ?? getDictionary(locale).common.feedback;
  return (
    <div className="pointer-events-none fixed top-1/2 right-0 z-40 hidden -translate-y-1/2 lg:block">
      <button
        type="button"
        className="pointer-events-auto rounded-l-md bg-brand py-3 pr-1 pl-1.5 text-[11px] font-medium tracking-wide text-white shadow-lg transition-colors hover:bg-brand-hover [writing-mode:vertical-rl]"
      >
        {resolvedLabel}
      </button>
    </div>
  );
}
