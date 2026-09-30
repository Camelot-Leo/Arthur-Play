"use client";
import { resultSvg, type PublicInteractive, type SlideResults } from "@arthur/shared";

async function fontDataUrl(path: string): Promise<string> {
  const blob = await (await fetch(path)).blob();
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = reject;
    r.readAsDataURL(blob);
  });
}

/**
 * Scarica il PNG del risultato di una slide, generato interamente nel browser:
 * SVG (con i font self-hosted incorporati) → canvas → PNG. Nulla viene inviato al server.
 */
export async function downloadResultPng(opts: {
  slide: PublicInteractive;
  data: SlideResults;
  solution?: { correctOptionId?: string; acceptedAnswers?: string[] } | null;
  filename: string;
}) {
  let fontCss = "";
  try {
    const [clash, satoshi] = await Promise.all([fontDataUrl("/fonts/ClashDisplay-Variable.woff2"), fontDataUrl("/fonts/Satoshi-Variable.woff2")]);
    fontCss = `@font-face{font-family:"Clash Display";src:url(${clash}) format("woff2");font-weight:200 700}@font-face{font-family:"Satoshi";src:url(${satoshi}) format("woff2");font-weight:300 900}`;
  } catch {
    // Senza font incorporati l'immagine usa il font di ripiego.
  }
  const svg = resultSvg({ slide: opts.slide, data: opts.data, solution: opts.solution, fontCss });
  const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const canvas = document.createElement("canvas");
    canvas.width = 1600;
    canvas.height = 900;
    canvas.getContext("2d")!.drawImage(img, 0, 0);
    const png = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/png"));
    if (!png) return;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(png);
    a.download = opts.filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  } finally {
    URL.revokeObjectURL(url);
  }
}
