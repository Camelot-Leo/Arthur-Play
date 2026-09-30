"use client";
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { useState } from "react";
import { T, type PublicInteractive } from "@arthur/shared";
import { SubmitButton, type SubmitFn } from "./SubmitButton";

type RankingSlide = Extract<PublicInteractive, { type: "ranking" }>;

/** Ranking: ordinamento con trascinamento (anche da tastiera) o con i pulsanti su/giù. */
export function RankingInput({ slide, onSubmit, disabled }: { slide: RankingSlide; onSubmit: SubmitFn; disabled: boolean }) {
  const [order, setOrder] = useState(() => slide.options.map((o) => o.id));
  const labels = Object.fromEntries(slide.options.map((o) => [o.id, o.label]));
  const sensors = useSensors(useSensor(PointerSensor), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  const move = (i: number, d: -1 | 1) => setOrder((o) => (i + d < 0 || i + d >= o.length ? o : arrayMove(o, i, i + d)));
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (over && active.id !== over.id) setOrder((o) => arrayMove(o, o.indexOf(String(active.id)), o.indexOf(String(over.id))));
  };
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void onSubmit({ order });
      }}
    >
      <p className="mb-3 text-muted">{T.participant.rankingHint}</p>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={onDragEnd}
        accessibility={{
          screenReaderInstructions: { draggable: T.participant.rankingHint },
        }}
      >
        <SortableContext items={order} strategy={verticalListSortingStrategy}>
          <ol className="flex flex-col gap-2">
            {order.map((id, i) => (
              <RankItem key={id} id={id} label={labels[id]!} index={i} last={i === order.length - 1} disabled={disabled} onMove={move} />
            ))}
          </ol>
        </SortableContext>
      </DndContext>
      <SubmitButton disabled={disabled} />
    </form>
  );
}

function RankItem(props: { id: string; label: string; index: number; last: boolean; disabled: boolean; onMove: (i: number, d: -1 | 1) => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: props.id, disabled: props.disabled });
  const style = {
    transform: transform ? `translate3d(${Math.round(transform.x)}px, ${Math.round(transform.y)}px, 0)` : undefined,
    transition,
  };
  return (
    <li
      ref={setNodeRef}
      style={style}
      className={`flex min-h-14 items-center gap-2 rounded-2xl border-2 border-black bg-white px-2 ${isDragging ? "z-10 shadow-lg" : ""}`}
    >
      <button
        type="button"
        className="grid h-11 w-9 shrink-0 cursor-grab touch-none place-items-center text-xl"
        aria-label={T.participant.dragHandle(props.label)}
        {...attributes}
        {...listeners}
      >
        ⠿
      </button>
      <span className="w-8 shrink-0 font-display text-lg font-semibold">{T.participant.position(props.index + 1)}</span>
      <span className="min-w-0 flex-1 font-bold">{props.label}</span>
      <button type="button" className="btn min-h-11 w-11 shrink-0 p-0" aria-label={T.participant.moveUp(props.label)} disabled={props.disabled || props.index === 0} onClick={() => props.onMove(props.index, -1)}>
        ↑
      </button>
      <button type="button" className="btn min-h-11 w-11 shrink-0 p-0" aria-label={T.participant.moveDown(props.label)} disabled={props.disabled || props.last} onClick={() => props.onMove(props.index, 1)}>
        ↓
      </button>
    </li>
  );
}
