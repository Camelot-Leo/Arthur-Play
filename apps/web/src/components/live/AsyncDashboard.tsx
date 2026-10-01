"use client";
import Link from "next/link";
import { EV, T, isInteractive, toPublicSlide, type PublicInteractive } from "@arthur/shared";
import { Footer } from "@/components/Footer";
import { QrCode } from "@/components/QrCode";
import { Results } from "@/components/slides/Results";
import { SlideHeading } from "@/components/slides/SlideParts";
import { downloadResultPng } from "@/lib/client/download-png";
import { useLiveSession } from "@/lib/client/useLiveSession";
import { formatCode } from "./format";

const formatDate = (ms: number) =>
  new Intl.DateTimeFormat("it-IT", { dateStyle: "full", timeStyle: "short", timeZone: "Europe/Rome" }).format(new Date(ms));

/**
 * Dashboard della modalità a ritmo libero: solo risultati aggregati, aggiornati in tempo reale,
 * che si cancellano alla scadenza o alla chiusura. Nessun dato per singolo partecipante.
 */
export function AsyncDashboard({ sid, joinBase }: { sid: string; joinBase: string }) {
  const live = useLiveSession(sid, "control");
  const joinUrl = live.code ? `${joinBase}/g/${live.code}` : "";

  if (live.ended) {
    return (
      <main id="contenuto" className="mx-auto flex min-h-dvh max-w-xl flex-col justify-center gap-6 px-4">
        <h1 className="text-3xl font-semibold">{T.control.ended}</h1>
        <Link href="/attivita" className="btn self-start">
          {T.control.backToActivities}
        </Link>
      </main>
    );
  }

  const activity = live.activity;
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b-2 border-black px-4 py-3">
        <h1 className="text-xl font-semibold">
          {T.async.dashboard}
          {activity && <span className="font-normal text-muted"> · {activity.title}</span>}
        </h1>
        <div className="flex flex-wrap items-center gap-3">
          <p aria-live="polite" className="font-bold">
            {T.async.started(live.participants)}
          </p>
          <button
            type="button"
            className="btn btn-dark"
            onClick={() => {
              if (window.confirm(T.async.closeConfirm)) void live.send(EV.close);
            }}
          >
            {T.async.close}
          </button>
        </div>
      </header>
      <main id="contenuto" className="grid flex-1 gap-6 p-4 lg:grid-cols-[2fr_1fr]">
        <section className="flex flex-col gap-6" aria-label={T.async.dashboard}>
          <p className="rounded-xl bg-soft p-3 text-sm">{T.async.onlyAggregates}</p>
          {activity?.slides.filter(isInteractive).map((sl, i) => {
            const data = live.bySlide[sl.id] ?? null;
            return (
              <article key={sl.id} className="card p-5">
                <p className="mb-1 text-sm font-bold uppercase tracking-wide text-muted">
                  {i + 1}. {T.slideTypes[sl.type]}
                </p>
                <SlideHeading slide={sl} size="compact" />
                <div className="mt-4">
                  <Results
                    slide={sl}
                    data={data}
                    variant="control"
                    onHide={(itemId, hidden) => void live.send(EV.hide, { slideId: sl.id, itemId, hidden })}
                    qaControls={{ onMark: (qid, answered) => void live.send(EV.qaMark, { slideId: sl.id, qid, answered }) }}
                    solution={sl.type === "quiz" ? { correctOptionId: sl.correctOptionId, acceptedAnswers: sl.acceptedAnswers } : null}
                  />
                </div>
                {data && data.respondents > 0 && (
                  <button
                    type="button"
                    className="btn mt-4 min-h-10 px-3 text-sm"
                    onClick={() =>
                      void downloadResultPng({
                        slide: toPublicSlide(sl) as PublicInteractive,
                        data,
                        solution: sl.type === "quiz" ? { correctOptionId: sl.correctOptionId, acceptedAnswers: sl.acceptedAnswers } : null,
                        filename: `risultato-${i + 1}.png`,
                      })
                    }
                  >
                    {T.results.downloadPng}
                  </button>
                )}
              </article>
            );
          })}
        </section>
        <aside className="flex flex-col gap-4">
          {live.expiresAt > 0 && <p className="font-bold">{T.async.expiresOn(formatDate(live.expiresAt))}</p>}
          <p>
            {T.control.code} <strong className="font-mono text-2xl">{formatCode(live.code)}</strong>
          </p>
          {joinUrl && (
            <>
              <p className="text-sm">
                {T.async.shareLink}: <span className="break-all font-mono">{joinUrl}</span>
              </p>
              <QrCode value={joinUrl} label={T.projection.qrAlt(joinUrl)} className="h-48 w-48" />
            </>
          )}
        </aside>
      </main>
      <Footer />
    </div>
  );
}
