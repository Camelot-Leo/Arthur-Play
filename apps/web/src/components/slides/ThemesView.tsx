import { T, type Theme } from "@arthur/shared";

/** Temi emersi dalle risposte (raggruppati dall'AI sui soli testi visibili). */
export function ThemesView({ themes, size = "projection" }: { themes: Theme[]; size?: "projection" | "compact" }) {
  const big = size === "projection";
  return (
    <section aria-label={T.ai.themesTitle}>
      {big && <p className="mb-4 text-sm font-bold uppercase tracking-wide text-brand-ink">✨ {T.ai.themesTitle}</p>}
      <ul className={`grid gap-4 ${big ? "grid-cols-2 xl:grid-cols-3" : "grid-cols-1"}`}>
        {themes.map((t) => (
          <li key={t.label} className={`animate-slide-in rounded-2xl border-2 border-black ${big ? "p-5" : "p-3"}`}>
            <div className="flex items-baseline justify-between gap-3">
              <h3 className={`font-display font-semibold ${big ? "text-[clamp(1.4rem,2.4vw,2.6rem)]" : "text-lg"}`}>{t.label}</h3>
              <span className={`shrink-0 font-bold tabular-nums ${big ? "text-xl" : "text-sm"}`}>{T.ai.themeCount(t.count)}</span>
            </div>
            <ul className={`mt-2 text-muted ${big ? "text-lg" : "text-sm"}`}>
              {t.examples.map((e) => (
                <li key={e}>«{e}»</li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </section>
  );
}
