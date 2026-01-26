import { useMemo } from "react";

const variants = Array.from({ length: 24 }, (_, index) => ({
  id: index + 1,
  className: `variant-${String(index + 1).padStart(2, "0")}`,
}));

export default function ButtonsPage() {
  const buttons = useMemo(() => variants, []);
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold text-white">Play/Pause Button Variants</h2>
        <p className="mt-2 text-sm text-white/70">
          Pick the button that looks least cropped. Each example toggles between play and pause
          state on click.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {buttons.map((variant) => (
          <div
            key={variant.id}
            className="flex flex-col items-center gap-3 rounded-lg border border-white/10 bg-white/5 p-4"
          >
            <button
              type="button"
              className={`play-variant is-paused ${variant.className}`}
              onClick={(event) => {
                event.currentTarget.classList.toggle("is-paused");
              }}
              aria-label={`Variant ${variant.id}`}
            >
              <span className="play-variant-icon" aria-hidden />
            </button>
            <span className="text-xs text-white/60">#{variant.id.toString().padStart(2, "0")}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
