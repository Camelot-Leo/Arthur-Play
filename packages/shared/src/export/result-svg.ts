/**
 * Immagine del risultato di una slide, come SVG 1600×900 (poi convertita in PNG nel browser).
 * Funzione pura: contiene solo testi della slide e aggregati già visibili in Proiezione
 * (nessuna voce nascosta o filtrata, nessun dato dei partecipanti).
 */
import type { SlideResults } from "../protocol";
import type { PublicInteractive } from "../slides/schema";

const W = 1600;
const H = 900;
const PAD = 80;
const RED = "#FF3A20";
const BLACK = "#000000";
const MUTED = "#595959";
const SOFT = "#F4F4F4";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const nf = new Intl.NumberFormat("it-IT", { maximumFractionDigits: 1 });

/** A capo approssimativo per larghezza media del carattere. */
function wrap(text: string, maxChars: number, maxLines: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    if ((cur + " " + w).trim().length > maxChars && cur) {
      lines.push(cur);
      cur = w;
    } else cur = (cur + " " + w).trim();
  }
  if (cur) lines.push(cur);
  if (lines.length > maxLines) {
    const cut = lines.slice(0, maxLines);
    cut[maxLines - 1] = `${cut[maxLines - 1]!.slice(0, maxChars - 1)}…`;
    return cut;
  }
  return lines;
}

const text = (x: number, y: number, s: string, size: number, opts: { weight?: number; fill?: string; anchor?: string; font?: "display" | "sans" } = {}) =>
  `<text x="${x}" y="${y}" font-family="${opts.font === "display" ? "Clash Display" : "Satoshi"}, Arial, sans-serif" font-size="${size}" font-weight="${opts.weight ?? 400}" fill="${opts.fill ?? BLACK}"${opts.anchor ? ` text-anchor="${opts.anchor}"` : ""}>${esc(s)}</text>`;

type Bar = { label: string; value: number; display: string; highlight?: boolean };

function bars(items: Bar[], top: number, max: number): string {
  const avail = H - top - 90;
  const step = Math.min(110, avail / Math.max(1, items.length));
  const barH = Math.max(14, step * 0.32);
  return items
    .map((b, i) => {
      const y = top + i * step;
      const w = max > 0 ? ((W - 2 * PAD) * b.value) / max : 0;
      return [
        text(PAD, y + step * 0.38, b.label.length > 60 ? `${b.label.slice(0, 59)}…` : b.label, Math.min(34, step * 0.34), { weight: 700 }),
        text(W - PAD, y + step * 0.38, b.display, Math.min(34, step * 0.34), { weight: 700, anchor: "end" }),
        `<rect x="${PAD}" y="${y + step * 0.48}" width="${W - 2 * PAD}" height="${barH}" rx="${barH / 2}" fill="${SOFT}"/>`,
        w > 0 ? `<rect x="${PAD}" y="${y + step * 0.48}" width="${w}" height="${barH}" rx="${barH / 2}" fill="${b.highlight === false ? MUTED : b.highlight ? BLACK : RED}"/>` : "",
      ].join("");
    })
    .join("");
}

function body(slide: PublicInteractive, data: SlideResults, top: number, solution: { correctOptionId?: string; acceptedAnswers?: string[] } | null): string {
  switch (data.type) {
    case "choice": {
      if (slide.type !== "choice") return "";
      const n = data.respondents;
      return bars(
        slide.options.map((o) => {
          const c = data.counts[o.id] ?? 0;
          return { label: o.label, value: n ? c / n : 0, display: `${n ? Math.round((c / n) * 100) : 0}% (${c})` };
        }),
        top,
        1,
      );
    }
    case "points": {
      if (slide.type !== "points") return "";
      const sorted = [...slide.options].sort((a, b) => (data.avg[b.id] ?? 0) - (data.avg[a.id] ?? 0));
      return bars(sorted.map((o) => ({ label: o.label, value: data.avg[o.id] ?? 0, display: `${nf.format(data.avg[o.id] ?? 0)} punti` })), top, 100);
    }
    case "ranking": {
      if (slide.type !== "ranking") return "";
      const n = slide.options.length;
      const sorted = [...slide.options].sort((a, b) => (data.avgRank[a.id] ?? n) - (data.avgRank[b.id] ?? n));
      return bars(
        sorted.map((o, i) => ({ label: `${i + 1}. ${o.label}`, value: n - (data.avgRank[o.id] ?? n) + 1, display: `pos. media ${nf.format(data.avgRank[o.id] ?? 0)}` })),
        top,
        n,
      );
    }
    case "scale": {
      if (slide.type !== "scale") return "";
      return bars(
        slide.statements.map((s) => {
          const st = data.stats[s.id];
          return { label: s.label, value: st?.avg ?? 0, display: `media ${nf.format(st?.avg ?? 0)} / ${slide.max}` };
        }),
        top,
        slide.max,
      );
    }
    case "quiz": {
      if (slide.type !== "quiz") return "";
      if (slide.mode === "single") {
        return bars(
          slide.options.map((o) => ({
            label: `${solution?.correctOptionId === o.id ? "✓ " : ""}${o.label}`,
            value: data.counts[o.id] ?? 0,
            display: String(data.counts[o.id] ?? 0),
            highlight: solution ? solution.correctOptionId === o.id : undefined,
          })),
          top,
          Math.max(1, ...Object.values(data.counts)),
        );
      }
      return [
        text(PAD, top + 60, `${data.correct} risposte corrette su ${data.respondents}`, 56, { weight: 700, font: "display" }),
        solution?.acceptedAnswers ? text(PAD, top + 140, `Risposte accettate: ${solution.acceptedAnswers.join(" · ")}`, 36) : "",
      ].join("");
    }
    case "open": {
      const items = data.items.filter((i) => !i.hidden).slice(0, 12);
      const colW = (W - 2 * PAD - 40) / 2;
      return items
        .map((it, i) => {
          const col = i % 2;
          const row = Math.floor(i / 2);
          const x = PAD + col * (colW + 40);
          const y = top + row * 98;
          const lines = wrap(it.text, 58, 2);
          return (
            `<rect x="${x}" y="${y}" width="${colW}" height="84" rx="18" fill="none" stroke="${BLACK}" stroke-width="3"/>` +
            lines.map((l, j) => text(x + 22, y + 36 + j * 30, l, 24)).join("")
          );
        })
        .join("");
    }
    case "wordcloud": {
      const words = data.words.filter((w) => !w.hidden).slice(0, 40);
      const max = Math.max(1, ...words.map((w) => w.count));
      let x = PAD;
      let y = top + 60;
      let rowH = 0;
      const out: string[] = [];
      words.forEach((w, i) => {
        const size = Math.round(28 + (w.count / max) * 72);
        const width = w.word.length * size * 0.6 + 36;
        if (x + width > W - PAD) {
          x = PAD;
          y += rowH + 16;
          rowH = 0;
        }
        if (y > H - 90) return;
        rowH = Math.max(rowH, size);
        out.push(text(x, y + size * 0.4, w.word, size, { weight: 600, fill: i % 3 === 0 ? RED : BLACK, font: "display" }));
        x += width;
      });
      return out.join("");
    }
    case "grid": {
      if (slide.type !== "grid") return "";
      const size = H - top - 110;
      const gx = PAD + 60;
      const gy = top + 30;
      const pts = slide.items
        .map((it, i) => {
          const p = data.points[it.id];
          if (!p?.count) return "";
          const cx = gx + (p.x / 100) * size;
          const cy = gy + (1 - p.y / 100) * size;
          return `<circle cx="${cx}" cy="${cy}" r="24" fill="${RED}" stroke="${BLACK}" stroke-width="3"/>` + text(cx, cy + 9, String(i + 1), 26, { weight: 700, anchor: "middle" });
        })
        .join("");
      const legend = slide.items.map((it, i) => text(gx + size + 80, gy + 40 + i * 50, `${i + 1}. ${it.label}`, 30, { weight: 700 })).join("");
      return [
        `<rect x="${gx}" y="${gy}" width="${size}" height="${size}" rx="16" fill="none" stroke="${BLACK}" stroke-width="3"/>`,
        `<line x1="${gx + size / 2}" y1="${gy}" x2="${gx + size / 2}" y2="${gy + size}" stroke="#D4D4D4" stroke-width="2"/>`,
        `<line x1="${gx}" y1="${gy + size / 2}" x2="${gx + size}" y2="${gy + size / 2}" stroke="#D4D4D4" stroke-width="2"/>`,
        text(gx + size / 2, gy - 10, slide.yAxis.max, 22, { weight: 700, anchor: "middle" }),
        text(gx + size / 2, gy + size + 30, slide.yAxis.min, 22, { weight: 700, anchor: "middle" }),
        text(gx - 12, gy + size / 2, slide.xAxis.min, 22, { weight: 700, anchor: "end" }),
        text(gx + size + 12, gy + size / 2, slide.xAxis.max, 22, { weight: 700 }),
        pts,
        legend,
      ].join("");
    }
    case "qa": {
      return data.items
        .filter((q) => !q.hidden)
        .slice(0, 7)
        .map((q, i) => {
          const y = top + i * 90;
          return (
            text(PAD, y + 50, `▲ ${q.votes}`, 34, { weight: 700, fill: RED }) +
            wrap(q.text, 70, 2)
              .map((l, j) => text(PAD + 150, y + 38 + j * 34, l, 28, { fill: q.answered ? MUTED : BLACK }))
              .join("")
          );
        })
        .join("");
    }
  }
}

export function resultSvg(opts: {
  slide: PublicInteractive;
  data: SlideResults;
  solution?: { correctOptionId?: string; acceptedAnswers?: string[] } | null;
  fontCss?: string;
}): string {
  const titleLines = wrap(opts.slide.question, 52, 2);
  const top = PAD + titleLines.length * 64 + 30;
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`,
    opts.fontCss ? `<defs><style>${opts.fontCss}</style></defs>` : "",
    `<rect width="${W}" height="${H}" fill="#FFFFFF"/>`,
    titleLines.map((l, i) => text(PAD, PAD + 40 + i * 64, l, 56, { weight: 600, font: "display" })).join(""),
    body(opts.slide, opts.data, top, opts.solution ?? null),
    `<rect x="0" y="${H - 12}" width="${W}" height="12" fill="${RED}"/>`,
    text(W - PAD, H - 36, `Arthur Play · ${opts.data.respondents} ${opts.data.type === "qa" ? "domande" : "risposte"}`, 24, { fill: MUTED, anchor: "end" }),
    `</svg>`,
  ].join("");
}
