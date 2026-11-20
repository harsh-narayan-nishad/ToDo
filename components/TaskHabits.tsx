"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowRight, BedDouble, Moon } from "lucide-react";
import { HabitRow } from "@/components/HabitsPanel";
import { SleepDialog } from "@/components/HabitDialogs";
import { clock, addDays, today } from "@/lib/days";
import { habitApi, indexEntries, isDone, isPlanned, minutesLabel, type EntryIndex, type Habit, type HabitEntry } from "@/lib/habits";

/**
 * Today's habits inside the Tasks list, checked in right here (same rows as the Habits tab).
 * `onlyDone` = the Done filter: show only habits already done today. Hidden when there is nothing to show
 * (or while the backend has no habit tracker yet).
 */
export function TaskHabits({ refreshKey, onlyDone, onChanged, onOpenHabits }: { refreshKey: number; onlyDone: boolean; onChanged: () => void; onOpenHabits?: () => void }) {
  const now = today();
  const [habits, setHabits] = useState<Habit[]>([]);
  const [index, setIndex] = useState<EntryIndex>(new Map());
  const [error, setError] = useState<string | null>(null);
  const [sleepOpen, setSleepOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      // Enough history for the streaks and the last-7-days dots.
      const [h, e] = await Promise.all([habitApi.list(), habitApi.entries(addDays(today(), -120), today())]);
      setHabits(h.filter((x) => !x.archived));
      setIndex(indexEntries(e));
      setError(null);
    } catch {
      setHabits([]);
    }
  }, []);
  useEffect(() => { void load(); }, [load, refreshKey]);

  const putToday = useCallback((habitId: string, entry: HabitEntry | null) => {
    setIndex((prev) => {
      const next = new Map(prev);
      const days = new Map(next.get(habitId) ?? []);
      if (entry) days.set(entry.day, entry); else days.delete(today());
      next.set(habitId, days);
      return next;
    });
  }, []);
  const fail = useCallback((e: unknown) => { setError(e instanceof Error ? e.message : "Could not save."); void load(); }, [load]);

  async function toggle(h: Habit) {
    const done = isDone(h, index.get(h.id)?.get(now));
    putToday(h.id, done ? null : { id: "local", habitId: h.id, day: now, value: 1, bedTime: null, wakeTime: null, quality: null, note: "" });
    try {
      if (done) await habitApi.clear(h.id, now);
      else putToday(h.id, await habitApi.set(h.id, now, {}));
      setError(null);
      onChanged();
    } catch (e) { fail(e); }
  }

  /** Counts and minutes: shown at once, saved after a short pause. */
  const pending = useRef(new Map<string, { value: number; timer: ReturnType<typeof setTimeout> }>());
  const flush = useCallback(async (habitId: string, value: number) => {
    pending.current.delete(habitId);
    try {
      const e = await habitApi.set(habitId, today(), { value });
      if (!pending.current.has(habitId)) putToday(habitId, e);
      setError(null);
      onChanged();
    } catch (err) { fail(err); }
  }, [putToday, fail, onChanged]);
  function setAmount(h: Habit, value: number) {
    const v = Math.max(0, Math.min(h.kind === "duration" ? 1440 : 100000, Math.round(value)));
    putToday(h.id, v ? { id: index.get(h.id)?.get(now)?.id ?? "local", habitId: h.id, day: now, value: v, bedTime: null, wakeTime: null, quality: null, note: "" } : null);
    const p = pending.current.get(h.id);
    if (p) clearTimeout(p.timer);
    pending.current.set(h.id, { value: v, timer: setTimeout(() => void flush(h.id, v), 500) });
  }
  useEffect(() => () => {
    for (const [id, p] of pending.current) { clearTimeout(p.timer); void habitApi.set(id, today(), { value: p.value }).catch(() => undefined); }
  }, []);

  const planned = habits.filter((h) => isPlanned(h, now));
  const sleep = planned.find((h) => h.kind === "sleep");
  const others = planned.filter((h) => h.kind !== "sleep");
  const doneCount = planned.filter((h) => isDone(h, index.get(h.id)?.get(now))).length;
  const shown = onlyDone ? others.filter((h) => isDone(h, index.get(h.id)?.get(now))) : others;
  const lastNight = sleep ? index.get(sleep.id)?.get(now) : undefined;
  const showSleep = sleep && (!onlyDone || !!lastNight);
  if (!shown.length && !showSleep) return null;

  return (
    <section>
      <h2 className="mb-3 flex items-center justify-between gap-3 text-sm uppercase tracking-wide text-ink-muted">
        <span>Habits · {doneCount} of {planned.length}</span>
        {onOpenHabits && (
          <button type="button" onClick={onOpenHabits} className="flex items-center gap-1 text-xs normal-case tracking-normal text-ink-faint">
            All habits <ArrowRight className="h-3.5 w-3.5" aria-hidden />
          </button>
        )}
      </h2>
      {error && <p className="mb-2 text-sm text-accent-extreme" role="alert">{error}</p>}
      <ul className="flex flex-col divide-y divide-overlay/10 border border-overlay/10 bg-canvas-raised">
        {showSleep && sleep && (
          <li className="flex items-center gap-4 px-4 py-4 sm:px-5">
            <Moon className="h-6 w-6 shrink-0 text-ink-muted" aria-hidden />
            <div className="min-w-0 flex-1">
              <p className={lastNight ? "text-ink-muted" : "text-ink"}>{sleep.name}</p>
              <p className="mt-1 text-xs text-ink-faint">
                {lastNight ? `${minutesLabel(lastNight.value)} last night${lastNight.bedTime && lastNight.wakeTime ? ` · ${clock(lastNight.bedTime)} – ${clock(lastNight.wakeTime)}` : ""}` : `Goal ${minutesLabel(sleep.target)} · not logged yet`}
              </p>
            </div>
            <button type="button" onClick={() => setSleepOpen(true)} className="flex shrink-0 items-center gap-2 border border-overlay/15 px-3 py-1.5 text-sm text-ink">
              <BedDouble className="h-4 w-4" aria-hidden />{lastNight ? "Edit" : "Log"}
            </button>
          </li>
        )}
        {shown.map((h) => (
          <HabitRow key={h.id} habit={h} byDay={index.get(h.id)} now={now} onToggle={() => void toggle(h)} onAmount={(v) => setAmount(h, v)} onOpen={() => onOpenHabits?.()} />
        ))}
      </ul>
      {sleepOpen && sleep && (
        <SleepDialog habit={sleep} entry={lastNight} onClose={() => setSleepOpen(false)}
          onSave={async (body) => { putToday(sleep.id, await habitApi.set(sleep.id, now, body)); setError(null); onChanged(); }} />
      )}
    </section>
  );
}
