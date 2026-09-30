"use client";
import Link from "next/link";
import { useId, useState } from "react";
import { LIMITS, T, type ActivityContent, type ActivitySettings, type Slide, type SlideType } from "@arthur/shared";
import { Footer } from "@/components/Footer";

const newId = () => `s${Math.random().toString(36).slice(2, 10)}`;
const opt = (label = "") => ({ id: newId(), label });

function blankSlide(type: SlideType): Slide {
  switch (type) {
    case "content":
      return { id: newId(), type, title: "" };
    case "choice":
      return { id: newId(), type, question: "", multiple: false, options: [opt(), opt()] };
    case "scale":
      return { id: newId(), type, question: "", max: 5, statements: [opt()] };
    case "open":
      return { id: newId(), type, question: "", maxAnswers: 1 };
    case "wordcloud":
      return { id: newId(), type, question: "", maxEntries: 3 };
    case "grid":
      return { id: newId(), type, question: "", xAxis: { min: "", max: "" }, yAxis: { min: "", max: "" }, items: [opt(), opt()] };
    case "ranking":
      return { id: newId(), type, question: "", options: [opt(), opt(), opt()] };
    case "points":
      return { id: newId(), type, question: "", options: [opt(), opt(), opt()] };
    case "qa":
      return { id: newId(), type, question: "Avete domande?" };
    case "quiz": {
      const options = [opt(), opt()];
      return { id: newId(), type, question: "", mode: "single", options, correctOptionId: options[0]!.id, acceptedAnswers: [], timerSeconds: 20 };
    }
  }
}

const TYPES: SlideType[] = ["content", "choice", "scale", "open", "wordcloud", "grid", "ranking", "points", "qa", "quiz"];

/** Editor base (Fase 1): sequenza di slide in form. Anteprima dal vivo in Fase 6. */
export function Editor({ id, initial }: { id: string; initial: ActivityContent }) {
  const [content, setContent] = useState<ActivityContent>(initial);
  const [newType, setNewType] = useState<SlideType>("choice");
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");

  const setSlides = (fn: (s: Slide[]) => Slide[]) => {
    setContent((c) => ({ ...c, slides: fn(c.slides) }));
    setStatus("idle");
  };
  const updateSlide = (i: number, s: Slide) => setSlides((all) => all.map((x, j) => (j === i ? s : x)));
  const move = (i: number, d: -1 | 1) =>
    setSlides((all) => {
      const j = i + d;
      if (j < 0 || j >= all.length) return all;
      const copy = [...all];
      [copy[i], copy[j]] = [copy[j]!, copy[i]!];
      return copy;
    });

  const save = async () => {
    setStatus("saving");
    const res = await fetch(`/api/attivita/${id}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      // Le righe vuote delle risposte accettate dei quiz non vengono salvate.
      body: JSON.stringify({
        ...content,
        slides: content.slides.map((sl) => (sl.type === "quiz" ? { ...sl, acceptedAnswers: sl.acceptedAnswers.map((x) => x.trim()).filter(Boolean) } : sl)),
      }),
    }).catch(() => null);
    setStatus(res?.ok ? "saved" : "error");
  };

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col">
      <header className="flex items-center justify-between gap-4 px-4 pt-6">
        <Link href="/attivita" className="underline underline-offset-2">
          {T.app.back}
        </Link>
        <div className="flex items-center gap-3">
          <span aria-live="polite" className="text-sm">
            {status === "saved" && T.editor.saved}
            {status === "error" && <span className="font-bold text-brand-ink">{T.editor.saveError}</span>}
          </span>
          <button type="button" className="btn btn-primary" onClick={save} disabled={status === "saving"}>
            {T.editor.save}
          </button>
        </div>
      </header>
      <main id="contenuto" className="flex flex-1 flex-col gap-6 px-4 py-8">
        <h1 className="text-3xl font-semibold">{T.editor.title}</h1>
        <Field label={T.editor.activityTitle}>
          {(fid) => (
            <input
              id={fid}
              className="input"
              maxLength={LIMITS.titleMax}
              value={content.title}
              onChange={(e) => setContent((c) => ({ ...c, title: e.target.value }))}
            />
          )}
        </Field>
        <Field label={T.editor.description}>
          {(fid) => (
            <textarea
              id={fid}
              className="input min-h-20"
              maxLength={LIMITS.bodyMax}
              value={content.description ?? ""}
              onChange={(e) => setContent((c) => ({ ...c, description: e.target.value || undefined }))}
            />
          )}
        </Field>
        <label className="flex items-center gap-3 font-bold">
          <input
            type="checkbox"
            className="h-5 w-5 accent-brand"
            checked={content.settings.moderation}
            onChange={(e) => setContent((c) => ({ ...c, settings: { ...c.settings, moderation: e.target.checked } }))}
          />
          {T.editor.moderation}
        </label>

        <GameSettings settings={content.settings} onChange={(settings) => setContent((c) => ({ ...c, settings }))} />

        <ol className="flex flex-col gap-6">
          {content.slides.map((s, i) => (
            <li key={s.id} className="card p-4">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-xl font-semibold">
                  {T.editor.slideN(i + 1)} · {T.slideTypes[s.type]}
                </h2>
                <div className="flex gap-2">
                  <button type="button" className="btn min-h-10 px-3 text-sm" onClick={() => move(i, -1)} disabled={i === 0}>
                    {T.editor.moveUp}
                  </button>
                  <button type="button" className="btn min-h-10 px-3 text-sm" onClick={() => move(i, 1)} disabled={i === content.slides.length - 1}>
                    {T.editor.moveDown}
                  </button>
                  <button
                    type="button"
                    className="btn min-h-10 px-3 text-sm"
                    onClick={() => setSlides((all) => all.filter((_, j) => j !== i))}
                    disabled={content.slides.length === 1}
                  >
                    {T.editor.remove}
                  </button>
                </div>
              </div>
              <SlideForm slide={s} onChange={(n) => updateSlide(i, n)} />
            </li>
          ))}
        </ol>

        <div className="flex flex-wrap items-end gap-3">
          <Field label={T.editor.slideType}>
            {(fid) => (
              <select id={fid} className="input" value={newType} onChange={(e) => setNewType(e.target.value as SlideType)}>
                {TYPES.map((t) => (
                  <option key={t} value={t}>
                    {T.slideTypes[t]}
                  </option>
                ))}
              </select>
            )}
          </Field>
          <button
            type="button"
            className="btn btn-dark"
            disabled={content.slides.length >= LIMITS.slidesMax}
            onClick={() => setSlides((all) => [...all, blankSlide(newType)])}
          >
            {T.editor.addSlide}
          </button>
        </div>
      </main>
      <Footer />
    </div>
  );
}

function Field({ label, children }: { label: string; children: (id: string) => React.ReactNode }) {
  const id = useId();
  return (
    <div className="flex-1">
      <label htmlFor={id} className="label">
        {label}
      </label>
      {children(id)}
    </div>
  );
}

function TextField(props: { label: string; value: string; max: number; onChange: (v: string) => void; multiline?: boolean }) {
  return (
    <Field label={props.label}>
      {(id) =>
        props.multiline ? (
          <textarea id={id} className="input min-h-24" maxLength={props.max} value={props.value} onChange={(e) => props.onChange(e.target.value)} />
        ) : (
          <input id={id} className="input" maxLength={props.max} value={props.value} onChange={(e) => props.onChange(e.target.value)} />
        )
      }
    </Field>
  );
}

function OptionsEditor(props: {
  items: { id: string; label: string }[];
  label: (i: number) => string;
  addLabel: string;
  min: number;
  max: number;
  onChange: (items: { id: string; label: string }[]) => void;
}) {
  const { items, onChange } = props;
  return (
    <div className="flex flex-col gap-2">
      {items.map((o, i) => (
        <div key={o.id} className="flex items-end gap-2">
          <TextField label={props.label(i + 1)} value={o.label} max={LIMITS.optionLabelMax} onChange={(v) => onChange(items.map((x) => (x.id === o.id ? { ...x, label: v } : x)))} />
          <button
            type="button"
            className="btn min-h-12 px-3"
            aria-label={`${T.editor.removeOption}: ${props.label(i + 1)}`}
            disabled={items.length <= props.min}
            onClick={() => onChange(items.filter((x) => x.id !== o.id))}
          >
            ✕
          </button>
        </div>
      ))}
      <button type="button" className="btn self-start" disabled={items.length >= props.max} onClick={() => onChange([...items, opt()])}>
        {props.addLabel}
      </button>
    </div>
  );
}

function SlideForm({ slide, onChange }: { slide: Slide; onChange: (s: Slide) => void }) {
  const notes = (
    <TextField label={T.editor.notes} value={slide.notes ?? ""} max={LIMITS.notesMax} multiline onChange={(v) => onChange({ ...slide, notes: v || undefined })} />
  );
  switch (slide.type) {
    case "content":
      return (
        <div className="flex flex-col gap-4">
          <TextField label={T.editor.slideTitle} value={slide.title} max={LIMITS.titleMax} onChange={(v) => onChange({ ...slide, title: v })} />
          <TextField label={T.editor.body} value={slide.body ?? ""} max={LIMITS.bodyMax} multiline onChange={(v) => onChange({ ...slide, body: v || undefined })} />
          <ImageField slide={slide} onChange={onChange} />
          {notes}
        </div>
      );
    case "choice":
      return (
        <div className="flex flex-col gap-4">
          <TextField label={T.editor.question} value={slide.question} max={LIMITS.questionMax} onChange={(v) => onChange({ ...slide, question: v })} />
          <fieldset>
            <legend className="label">{T.editor.options}</legend>
            <OptionsEditor
              items={slide.options}
              label={T.editor.option}
              addLabel={T.editor.addOption}
              min={LIMITS.choiceOptionsMin}
              max={LIMITS.choiceOptionsMax}
              onChange={(options) => onChange({ ...slide, options })}
            />
          </fieldset>
          <label className="flex items-center gap-3 font-bold">
            <input type="checkbox" className="h-5 w-5 accent-brand" checked={slide.multiple} onChange={(e) => onChange({ ...slide, multiple: e.target.checked })} />
            {T.editor.multiple}
          </label>
          {notes}
        </div>
      );
    case "scale":
      return (
        <div className="flex flex-col gap-4">
          <TextField label={T.editor.question} value={slide.question} max={LIMITS.questionMax} onChange={(v) => onChange({ ...slide, question: v })} />
          <fieldset>
            <legend className="label">{T.editor.statements}</legend>
            <OptionsEditor
              items={slide.statements}
              label={T.editor.statement}
              addLabel={T.editor.addStatement}
              min={1}
              max={LIMITS.scaleStatementsMax}
              onChange={(statements) => onChange({ ...slide, statements })}
            />
          </fieldset>
          <fieldset>
            <legend className="label">{T.editor.scaleMax}</legend>
            <div className="flex gap-4">
              {([5, 10] as const).map((m) => (
                <label key={m} className="flex items-center gap-2">
                  <input type="radio" className="h-5 w-5 accent-brand" checked={slide.max === m} onChange={() => onChange({ ...slide, max: m })} />
                  {m === 5 ? T.editor.scale5 : T.editor.scale10}
                </label>
              ))}
            </div>
          </fieldset>
          <div className="flex gap-3">
            <TextField label={T.editor.minLabel} value={slide.minLabel ?? ""} max={40} onChange={(v) => onChange({ ...slide, minLabel: v || undefined })} />
            <TextField label={T.editor.maxLabel} value={slide.maxLabel ?? ""} max={40} onChange={(v) => onChange({ ...slide, maxLabel: v || undefined })} />
          </div>
          {notes}
        </div>
      );
    case "open":
      return (
        <div className="flex flex-col gap-4">
          <TextField label={T.editor.question} value={slide.question} max={LIMITS.questionMax} onChange={(v) => onChange({ ...slide, question: v })} />
          <NumberField label={T.editor.maxAnswers} value={slide.maxAnswers} max={LIMITS.openAnswersPerPersonMax} onChange={(n) => onChange({ ...slide, maxAnswers: n })} />
          {notes}
        </div>
      );
    case "wordcloud":
      return (
        <div className="flex flex-col gap-4">
          <TextField label={T.editor.question} value={slide.question} max={LIMITS.questionMax} onChange={(v) => onChange({ ...slide, question: v })} />
          <NumberField label={T.editor.maxEntries} value={slide.maxEntries} max={LIMITS.wordsPerPersonMax} onChange={(n) => onChange({ ...slide, maxEntries: n })} />
          {notes}
        </div>
      );
    case "grid":
      return (
        <div className="flex flex-col gap-4">
          <TextField label={T.editor.question} value={slide.question} max={LIMITS.questionMax} onChange={(v) => onChange({ ...slide, question: v })} />
          {(["xAxis", "yAxis"] as const).map((axis) => (
            <fieldset key={axis}>
              <legend className="label">{axis === "xAxis" ? T.editor.xAxis : T.editor.yAxis}</legend>
              <div className="flex gap-3">
                <TextField label={T.editor.axisMin} value={slide[axis].min} max={40} onChange={(v) => onChange({ ...slide, [axis]: { ...slide[axis], min: v } })} />
                <TextField label={T.editor.axisMax} value={slide[axis].max} max={40} onChange={(v) => onChange({ ...slide, [axis]: { ...slide[axis], max: v } })} />
              </div>
            </fieldset>
          ))}
          <fieldset>
            <legend className="label">{T.editor.items}</legend>
            <OptionsEditor items={slide.items} label={T.editor.item} addLabel={T.editor.addItem} min={1} max={LIMITS.gridItemsMax} onChange={(items) => onChange({ ...slide, items })} />
          </fieldset>
          {notes}
        </div>
      );
    case "ranking":
    case "points":
      return (
        <div className="flex flex-col gap-4">
          <TextField label={T.editor.question} value={slide.question} max={LIMITS.questionMax} onChange={(v) => onChange({ ...slide, question: v })} />
          <fieldset>
            <legend className="label">{T.editor.options}</legend>
            <OptionsEditor
              items={slide.options}
              label={T.editor.option}
              addLabel={T.editor.addOption}
              min={2}
              max={LIMITS.choiceOptionsMax}
              onChange={(options) => onChange({ ...slide, options })}
            />
          </fieldset>
          {notes}
        </div>
      );
    case "qa":
      return (
        <div className="flex flex-col gap-4">
          <TextField label={T.editor.question} value={slide.question} max={LIMITS.questionMax} onChange={(v) => onChange({ ...slide, question: v })} />
          {notes}
        </div>
      );
    case "quiz":
      return <QuizForm slide={slide} onChange={onChange} notes={notes} />;
  }
}

function QuizForm({ slide, onChange, notes }: { slide: Extract<Slide, { type: "quiz" }>; onChange: (s: Slide) => void; notes: React.ReactNode }) {
  const name = useId();
  return (
    <div className="flex flex-col gap-4">
      <TextField label={T.editor.question} value={slide.question} max={LIMITS.questionMax} onChange={(v) => onChange({ ...slide, question: v })} />
      <fieldset>
        <legend className="label">{T.editor.quizMode}</legend>
        <div className="flex gap-4">
          {(["single", "text"] as const).map((m) => (
            <label key={m} className="flex items-center gap-2">
              <input
                type="radio"
                className="h-5 w-5 accent-brand"
                checked={slide.mode === m}
                onChange={() => {
                  const options = m === "single" && slide.options.length < 2 ? [opt(), opt()] : slide.options;
                  onChange({ ...slide, mode: m, options, correctOptionId: m === "single" ? (slide.correctOptionId ?? options[0]?.id) : slide.correctOptionId });
                }}
              />
              {m === "single" ? T.editor.quizSingle : T.editor.quizText}
            </label>
          ))}
        </div>
      </fieldset>
      {slide.mode === "single" ? (
        <fieldset>
          <legend className="label">{T.editor.options}</legend>
          <OptionsEditor
            items={slide.options}
            label={T.editor.option}
            addLabel={T.editor.addOption}
            min={LIMITS.choiceOptionsMin}
            max={LIMITS.choiceOptionsMax}
            onChange={(options) =>
              onChange({ ...slide, options, correctOptionId: options.some((o) => o.id === slide.correctOptionId) ? slide.correctOptionId : options[0]?.id })
            }
          />
          <fieldset className="mt-3">
            <legend className="label">{T.editor.quizCorrect}</legend>
            <div className="flex flex-col gap-1">
              {slide.options.map((o, i) => (
                <label key={o.id} className="flex items-center gap-2">
                  <input type="radio" name={name} className="h-5 w-5 accent-brand" checked={slide.correctOptionId === o.id} onChange={() => onChange({ ...slide, correctOptionId: o.id })} />
                  {T.editor.quizCorrectOf(o.label || T.editor.option(i + 1))}
                </label>
              ))}
            </div>
          </fieldset>
        </fieldset>
      ) : (
        <TextField
          label={T.editor.quizAccepted}
          value={slide.acceptedAnswers.join("\n")}
          max={(LIMITS.quizAnswerMax + 1) * LIMITS.quizAcceptedMax}
          multiline
          onChange={(v) => onChange({ ...slide, acceptedAnswers: v.split("\n").slice(0, LIMITS.quizAcceptedMax) })}
        />
      )}
      <Field label={T.editor.quizTimer}>
        {(id) => (
          <input
            id={id}
            type="number"
            className="input max-w-32"
            min={LIMITS.timerMinSeconds}
            max={LIMITS.quizTimerMaxSeconds}
            value={slide.timerSeconds ?? ""}
            onChange={(e) => onChange({ ...slide, timerSeconds: e.target.value === "" ? null : Math.round(Number(e.target.value)) })}
          />
        )}
      </Field>
      {notes}
    </div>
  );
}

function NumberField({ label, value, max, onChange }: { label: string; value: number; max: number; onChange: (n: number) => void }) {
  return (
    <Field label={label}>
      {(id) => (
        <select id={id} className="input max-w-32" value={value} onChange={(e) => onChange(Number(e.target.value))}>
          {Array.from({ length: max }, (_, i) => i + 1).map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      )}
    </Field>
  );
}

function ImageField({ slide, onChange }: { slide: Extract<Slide, { type: "content" }>; onChange: (s: Slide) => void }) {
  const [error, setError] = useState(false);
  const fid = useId();
  if (slide.image) {
    return (
      <div className="flex flex-col gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element -- immagine servita dalla nostra API */}
        <img src={`/api/immagini/${slide.image.id}`} alt={slide.image.alt} className="max-h-48 self-start rounded-xl" />
        <TextField
          label={T.editor.imageAlt}
          value={slide.image.alt}
          max={LIMITS.imageAltMax}
          onChange={(alt) => onChange({ ...slide, image: { id: slide.image!.id, alt } })}
        />
        <button type="button" className="btn self-start" onClick={() => onChange({ ...slide, image: undefined })}>
          {T.editor.removeImage}
        </button>
      </div>
    );
  }
  return (
    <div>
      <label htmlFor={fid} className="label">
        {T.editor.image}
      </label>
      <input
        id={fid}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="block"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          setError(false);
          const form = new FormData();
          form.append("file", file);
          const res = await fetch("/api/immagini", { method: "POST", body: form }).catch(() => null);
          const body = (await res?.json().catch(() => null)) as { id?: string } | null;
          if (body?.id) onChange({ ...slide, image: { id: body.id, alt: "" } });
          else setError(true);
        }}
      />
      {error && (
        <p role="alert" className="mt-1 font-bold text-brand-ink">
          {T.editor.uploadError}
        </p>
      )}
    </div>
  );
}

/** Squadre, missione collettiva e classifica individuale (disattivata di default). */
function GameSettings({ settings, onChange }: { settings: ActivitySettings; onChange: (s: ActivitySettings) => void }) {
  const { teams, mission } = settings;
  const setTeams = (t: Partial<ActivitySettings["teams"]>) => onChange({ ...settings, teams: { ...teams, ...t } });
  const setMission = (m: Partial<ActivitySettings["mission"]>) => onChange({ ...settings, mission: { ...mission, ...m } });
  return (
    <fieldset className="card flex flex-col gap-4 p-4">
      <legend className="px-1 text-xl font-semibold">{T.editor.gamification}</legend>

      <label className="flex items-center gap-3 font-bold">
        <input type="checkbox" className="h-5 w-5 accent-brand" checked={teams.enabled} onChange={(e) => setTeams({ enabled: e.target.checked })} />
        {T.editor.teamsEnabled}
      </label>
      {teams.enabled && (
        <div className="flex flex-col gap-3 border-l-4 border-line pl-4">
          <fieldset>
            <legend className="label">{T.editor.teamsMode}</legend>
            <div className="flex flex-wrap gap-4">
              {(["auto", "choice"] as const).map((m) => (
                <label key={m} className="flex items-center gap-2">
                  <input type="radio" className="h-5 w-5 accent-brand" checked={teams.mode === m} onChange={() => setTeams({ mode: m })} />
                  {m === "auto" ? T.editor.teamsAuto : T.editor.teamsChoice}
                </label>
              ))}
            </div>
          </fieldset>
          {teams.names.map((n, i) => (
            <div key={i} className="flex items-end gap-2">
              <TextField label={T.editor.teamName(i + 1)} value={n} max={LIMITS.teamNameMax} onChange={(v) => setTeams({ names: teams.names.map((x, j) => (j === i ? v : x)) })} />
              <button
                type="button"
                className="btn min-h-12 px-3"
                aria-label={T.editor.removeTeam(n || T.editor.teamName(i + 1))}
                disabled={teams.names.length <= LIMITS.teamsMin}
                onClick={() => setTeams({ names: teams.names.filter((_, j) => j !== i) })}
              >
                ✕
              </button>
            </div>
          ))}
          <button
            type="button"
            className="btn self-start"
            disabled={teams.names.length >= LIMITS.teamsMax}
            onClick={() => setTeams({ names: [...teams.names, T.editor.defaultTeamName(teams.names.length + 1)] })}
          >
            {T.editor.addTeam}
          </button>
        </div>
      )}

      <label className="flex items-center gap-3 font-bold">
        <input
          type="checkbox"
          className="h-5 w-5 accent-brand"
          checked={settings.leaderboard && !teams.enabled}
          disabled={teams.enabled}
          onChange={(e) => onChange({ ...settings, leaderboard: e.target.checked })}
        />
        {T.editor.leaderboard}
      </label>
      {teams.enabled && <p className="text-sm text-muted">{T.editor.leaderboardTeamsNote}</p>}

      <label className="flex items-center gap-3 font-bold">
        <input type="checkbox" className="h-5 w-5 accent-brand" checked={mission.enabled} onChange={(e) => setMission({ enabled: e.target.checked })} />
        {T.editor.missionEnabled}
      </label>
      {mission.enabled && (
        <div className="flex flex-col gap-3 border-l-4 border-line pl-4">
          <fieldset>
            <legend className="label">{T.editor.missionType}</legend>
            <div className="flex flex-col gap-2">
              {(["correct", "answers"] as const).map((t) => (
                <label key={t} className="flex items-center gap-2">
                  <input
                    type="radio"
                    className="h-5 w-5 accent-brand"
                    checked={mission.type === t}
                    onChange={() => setMission({ type: t, target: t === "correct" ? Math.min(mission.target, 100) : mission.target })}
                  />
                  {t === "correct" ? T.editor.missionCorrect : T.editor.missionAnswers}
                </label>
              ))}
            </div>
          </fieldset>
          <Field label={`${T.editor.missionTarget}${mission.type === "correct" ? " (%)" : ""}`}>
            {(id) => (
              <input
                id={id}
                type="number"
                className="input max-w-32"
                min={1}
                max={mission.type === "correct" ? 100 : LIMITS.missionTargetMax}
                value={mission.target}
                onChange={(e) => setMission({ target: Math.max(1, Math.round(Number(e.target.value)) || 1) })}
              />
            )}
          </Field>
          <TextField label={T.editor.missionLabel} value={mission.label ?? ""} max={LIMITS.titleMax} onChange={(v) => setMission({ label: v || undefined })} />
        </div>
      )}
    </fieldset>
  );
}
