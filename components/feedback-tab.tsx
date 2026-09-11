export function FeedbackTab({ label = "Feedback" }: { label?: string }) {
  return (
    <div className="pointer-events-none fixed top-1/2 right-0 z-40 hidden -translate-y-1/2 lg:block">
      <button
        type="button"
        className="pointer-events-auto rounded-l-md bg-brand py-3 pr-1 pl-1.5 text-[11px] font-medium tracking-wide text-white shadow-lg transition-colors hover:bg-brand-hover [writing-mode:vertical-rl]"
      >
        {label}
      </button>
    </div>
  );
}
