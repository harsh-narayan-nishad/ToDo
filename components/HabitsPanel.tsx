"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BedDouble, Check, ChevronDown, Flame, Minus, Moon, Plus, SkipForward, Sunrise, Undo2 } from "lucide-react";
import { Badge, Card, ConfirmDialog, Empty, Stat } from "@/components/ui";
import { GlassButton } from "@/components/GlassButton";
import LiquidGlass from "@/components/LiquidGlass";
import { PanelLoader } from "@/components/WheelSpinner";
import { HabitDetail, HabitEditor, HabitGrid, Segmented, SleepDialog, levelOf } from "@/components/HabitDialogs";
import { ApiError } from "@/lib/api";
import { addDays, clock, dayLabel, longDay, today } from "@/lib/days";
import {
  TEMPLATES, averageClock, currentStreak, daysLabel, goal, goalLabel, habitApi, habitStatus, indexEntries, isDone, isDue, isPlanned, isSkipped, kindLabel, STATUS_LABEL, minutesLabel, progress, successRate,
  type EntryIndex, type Habit, type HabitEntry, type HabitInput, type HabitScale,
} from "@/lib/habits";
import { cn } from "@/lib/utils";

/** The habit tracker types, as the filter at the top: by size (micro → macro), habits to quit, and sleep. */
type Filter = "all" | HabitScale | "quit" | "sleep";
const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "All" }, { id: "micro", label: "Micro" }, { id: "daily", label: "Daily" }, { id: "macro", label: "Macro" }, { id: "quit", label: "Quit" }, { id: "sleep", label: "Sleep" },
];
const GROUPS: { id: HabitScale; title: string }[] = [{ id: "micro", title: "Micro habits" }, { id: "daily", title: "Daily habits" }, { id: "macro", title: "Macro habits" }];
/** A year and a bit of check-ins: enough for streaks and the 26-week grids. */
const HISTORY_DAYS = 370;

export function HabitsPanel({ version, onChanged }: { version: number; onChanged: () => void }) {
  const now = today();
  const [habits, setHabits] = useState<Habit[] | null>(null);
  const [index, setIndex] = useState<EntryIndex>(new Map());
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [editing, setEditing] = useState<{ habit?: Habit; preset?: Partial<HabitInput> } | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<Habit | null>(null);
  const [sleepOpen, setSleepOpen] = useState(false);
  const [showArchived, setShowArchived] = useState(false);

  const load = useCallback(async () => {
    try {
      const [h, e] = await Promise.all([habitApi.list(), habitApi.entries(addDays(today(), -HISTORY_DAYS), today())]);
      setHabits(h);
      setIndex(indexEntries(e));
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError && e.status === 404
        ? "The habit tracker needs the latest backend. Push the backend (git push) so Render deploys it, then reload."
        : e instanceof Error ? e.message : "Could not load your habits.");
      setHabits((h) => h ?? []);
    }
  }, []);
  useEffect(() => { void load(); }, [load, version]);

  /** Put one of today's entries into the local index (null = removed). */
  const putToday = useCallback((habitId: string, entry: HabitEntry | null) => {
    setIndex((prev) => {
      const next = new Map(prev);
      const days = new Map(next.get(habitId) ?? []);
      if (entry) days.set(entry.day, entry); else days.delete(now);
      next.set(habitId, days);
      return next;
    });
  }, [now]);

  const fail = useCallback((e: unknown) => { setError(e instanceof Error ? e.message : "Could not save."); void load(); }, [load]);

  /** Tick / untick a yes-no or quit habit for today. */
  async function toggle(h: Habit) {
    const done = isDone(h, index.get(h.id)?.get(now));
    putToday(h.id, done ? null : { id: "local", habitId: h.id, day: now, value: 1, bedTime: null, wakeTime: null, quality: null, note: "" });
    try {
      if (done) await habitApi.clear(h.id, now);
      else putToday(h.id, await habitApi.set(h.id, now, {}));
      setError(null);
    } catch (e) { fail(e); }
  }

  /** Skip today on purpose (neither done nor missed), or undo the skip. */
  async function skip(h: Habit, on: boolean) {
    const p = pending.current.get(h.id);
    if (p) { clearTimeout(p.timer); pending.current.delete(h.id); }
    putToday(h.id, on ? { id: "local", habitId: h.id, day: now, value: 0, bedTime: null, wakeTime: null, quality: null, note: "", skipped: true } : null);
    try {
      if (on) putToday(h.id, await habitApi.set(h.id, now, { skip: true }));
      else await habitApi.clear(h.id, now);
      setError(null);
    } catch (e) { fail(e); }
  }

  /** Counts and minutes change quickly (+, +, +), so the value shows at once and is saved after a short pause. */
  const pending = useRef(new Map<string, { value: number; timer: ReturnType<typeof setTimeout> }>());
  const flush = useCallback(async (habitId: string, value: number) => {
    pending.current.delete(habitId);
    try {
      const e = await habitApi.set(habitId, today(), { value });
      if (!pending.current.has(habitId)) putToday(habitId, e);
      setError(null);
    } catch (err) { fail(err); }
  }, [putToday, fail]);
  function setAmount(h: Habit, value: number) {
    const v = Math.max(0, Math.min(h.kind === "duration" ? 1440 : 100000, Math.round(value)));
    putToday(h.id, v ? { id: index.get(h.id)?.get(now)?.id ?? "local", habitId: h.id, day: now, value: v, bedTime: null, wakeTime: null, quality: null, note: "" } : null);
    const p = pending.current.get(h.id);
    if (p) clearTimeout(p.timer);
    pending.current.set(h.id, { value: v, timer: setTimeout(() => void flush(h.id, v), 500) });
  }
  // Leaving the tab saves whatever is still waiting.
  useEffect(() => () => {
    for (const [id, p] of pending.current) { clearTimeout(p.timer); void habitApi.set(id, today(), { value: p.value }).catch(() => undefined); }
  }, []);

  async function save(input: HabitInput, habit?: Habit) {
    if (habit) {
      const { kind: _k, ...patch } = input; // eslint-disable-line @typescript-eslint/no-unused-vars
      const u = await habitApi.update(habit.id, patch);
      setHabits((hs) => (hs ?? []).map((x) => (x.id === u.id ? u : x)));
    } else {
      const c = await habitApi.create(input);
      setHabits((hs) => [...(hs ?? []), c]);
    }
    setError(null);
    onChanged();
  }
  async function archive(h: Habit) {
    try {
      const u = await habitApi.update(h.id, { archived: !h.archived });
      setHabits((hs) => (hs ?? []).map((x) => (x.id === u.id ? u : x)));
      setDetailId(null);
      setError(null);
    } catch (e) { setError(e instanceof Error ? e.message : "Could not update."); }
  }

  const active = useMemo(() => (habits ?? []).filter((h) => !h.archived), [habits]);
  const archived = useMemo(() => (habits ?? []).filter((h) => h.archived), [habits]);
  const sleepHabit = active.find((h) => h.kind === "sleep");
  const others = active.filter((h) => h.kind !== "sleep");
  const shown = others.filter((h) => filter === "all" || (filter === "quit" ? h.kind === "quit" : h.scale === filter));
  const todayList = shown.filter((h) => isPlanned(h, now));
  const restList = shown.filter((h) => !isPlanned(h, now));
  const detail = (habits ?? []).find((h) => h.id === detailId) ?? null;

  // ---- summary ----
  const plannedToday = active.filter((h) => isDue(h, now, index.get(h.id)?.get(now)));
  const doneToday = plannedToday.filter((h) => isDone(h, index.get(h.id)?.get(now))).length;
  const rates = active.map((h) => successRate(h, index.get(h.id), 30, now)).filter((r): r is number => r !== null);
  const score = rates.length ? Math.round((rates.reduce((a, r) => a + r, 0) / rates.length) * 100) : null;
  const bestNow = active.reduce<{ n: number; name: string }>((b, h) => { const n = currentStreak(h, index.get(h.id), now); return n > b.n ? { n, name: h.name } : b; }, { n: 0, name: "" });
  const lastNight = sleepHabit ? index.get(sleepHabit.id)?.get(now) : undefined;
  /** Perfect days in a row: every planned habit done (today counts once it is perfect). */
  const perfect = useMemo(() => {
    let n = 0;
    for (let i = 0; i < HISTORY_DAYS; i++) {
      const d = addDays(now, -i);
      const planned = active.filter((h) => isDue(h, d, index.get(h.id)?.get(d)));
      if (!planned.length) { if (active.some((h) => h.startDay <= d)) continue; break; }
      const ok = planned.every((h) => isDone(h, index.get(h.id)?.get(d)));
      if (ok) n++; else if (i > 0) break;
    }
    return n;
  }, [active, index, now]);

  /** All habits together, the last 26 weeks: the share of planned habits done each day. */
  const overall = useMemo(() => {
    const out = [];
    for (let i = 181; i >= 0; i--) {
      const d = addDays(now, -i);
      const planned = active.filter((h) => isDue(h, d, index.get(h.id)?.get(d)));
      const done = planned.filter((h) => isDone(h, index.get(h.id)?.get(d))).length;
      out.push({ day: d, level: planned.length ? levelOf(done / planned.length) : 0, off: !planned.length, title: `${longDay(d)}: ${planned.length ? `${done} of ${planned.length} habits` : "no habits planned"}` });
    }
    return out;
  }, [active, index, now]);

  if (!habits) return <PanelLoader label="Loading habits" />;

  return (
    <div className="flex flex-col gap-8 pb-40">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Done today" value={plannedToday.length ? `${doneToday} / ${plannedToday.length}` : "–"} hint={plannedToday.length && doneToday === plannedToday.length ? "Everything done. Nice." : undefined} />
        <Stat label="Perfect days in a row" value={perfect} hint="Every planned habit done" />
        <Stat label="Last 30 days" value={score === null ? "–" : `${score}%`} hint={bestNow.n ? `Longest streak now: ${bestNow.name}, ${bestNow.n}` : "Planned days done"} />
        <Stat label="Last night's sleep" value={lastNight ? minutesLabel(lastNight.value) : "–"} hint={sleepHabit ? (lastNight ? `Goal ${minutesLabel(sleepHabit.target)}` : "Not logged yet") : "Not tracked"} />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Segmented label="Habit type" value={filter} options={FILTERS} onChange={setFilter} />
        <GlassButton type="button" strong onClick={() => setEditing({ preset: filter === "sleep" ? sleepPreset() : filter === "quit" ? { kind: "quit" } : filter !== "all" ? { scale: filter } : undefined })}>
          <Plus className="h-4 w-4" />New habit
        </GlassButton>
      </div>

      {error && <p className="text-sm text-accent-extreme" role="alert">{error}</p>}

      {(filter === "all" || filter === "sleep") && (
        <SleepCard habit={sleepHabit} byDay={sleepHabit ? index.get(sleepHabit.id) : undefined}
          onLog={() => setSleepOpen(true)} onStart={() => setEditing({ preset: sleepPreset() })} onOpen={() => sleepHabit && setDetailId(sleepHabit.id)} />
      )}

      {filter !== "sleep" && (
        <>
          {others.length === 0 ? (
            <Empty>No habits yet. Start small: add a micro habit like “Make the bed”, then build up to daily and macro ones.</Empty>
          ) : shown.length === 0 ? (
            <Empty>No {FILTERS.find((f) => f.id === filter)?.label.toLowerCase()} habits yet.</Empty>
          ) : (
            <section className="flex flex-col gap-6">
              <h2 className="font-display text-2xl">Today <span className="ml-2 text-base text-ink-faint">{longDay(now)}</span></h2>
              {todayList.length === 0 && <p className="text-sm text-ink-faint">Nothing planned for today.</p>}
              {(filter === "all" || filter === "quit" ? GROUPS : GROUPS.filter((g) => g.id === filter)).map((g) => {
                const list = todayList.filter((h) => h.scale === g.id);
                if (!list.length) return null;
                const done = list.filter((h) => isDone(h, index.get(h.id)?.get(now))).length;
                const due = list.filter((h) => !isSkipped(index.get(h.id)?.get(now))).length;
                return (
                  <div key={g.id}>
                    <h3 className="mb-2 flex items-center justify-between text-sm uppercase tracking-wide text-ink-muted"><span>{g.title}</span><span className="normal-case tracking-normal text-ink-faint">{done} of {due}{due < list.length ? ` · ${list.length - due} skipped` : ""}</span></h3>
                    <ul className="flex flex-col divide-y divide-overlay/10 border border-overlay/10 bg-canvas-raised">
                      {list.map((h) => <HabitRow key={h.id} habit={h} byDay={index.get(h.id)} now={now} onToggle={() => void toggle(h)} onAmount={(v) => setAmount(h, v)} onSkip={(on) => void skip(h, on)} onOpen={() => setDetailId(h.id)} />)}
                    </ul>
                  </div>
                );
              })}
              {restList.length > 0 && (
                <div>
                  <h3 className="mb-2 text-sm uppercase tracking-wide text-ink-muted">Not planned today</h3>
                  <ul className="flex flex-col divide-y divide-overlay/10 border border-overlay/10 bg-canvas-raised">
                    {restList.map((h) => <HabitRow key={h.id} habit={h} byDay={index.get(h.id)} now={now} onToggle={() => void toggle(h)} onAmount={(v) => setAmount(h, v)} onSkip={(on) => void skip(h, on)} onOpen={() => setDetailId(h.id)} />)}
                  </ul>
                </div>
              )}
            </section>
          )}
        </>
      )}

      {filter === "all" && active.length > 0 && (
        <Card>
          <h3 className="mb-4 text-sm uppercase tracking-wide text-ink-muted">All habits, last 26 weeks</h3>
          <HabitGrid cells={overall} />
        </Card>
      )}

      {archived.length > 0 && (
        <section>
          <button type="button" onClick={() => setShowArchived((s) => !s)} aria-expanded={showArchived} className="flex items-center gap-2 text-sm uppercase tracking-wide text-ink-muted">
            Archived ({archived.length}) <ChevronDown className={cn("h-4 w-4 transition-transform", showArchived && "rotate-180")} aria-hidden />
          </button>
          {showArchived && (
            <ul className="mt-3 flex flex-col divide-y divide-overlay/10 border border-overlay/10 bg-canvas-raised">
              {archived.map((h) => (
                <li key={h.id}>
                  <button type="button" onClick={() => setDetailId(h.id)} className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left sm:px-5">
                    <span className="text-ink-muted">{h.name}</span>
                    <span className="text-xs text-ink-faint">{kindLabel(h.kind)} · {daysLabel(h.days)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {editing && (
        <HabitEditor habit={editing.habit} preset={editing.preset} habits={habits} onClose={() => setEditing(null)} onSave={(input) => save(input, editing.habit)} />
      )}
      {detail && !editing && !deleting && (
        <HabitDetail habit={detail} byDay={index.get(detail.id)} onClose={() => setDetailId(null)}
          onEdit={() => setEditing({ habit: detail })} onArchive={() => archive(detail)} onDelete={() => setDeleting(detail)} />
      )}
      {sleepOpen && sleepHabit && (
        <SleepDialog habit={sleepHabit} entry={lastNight} onClose={() => setSleepOpen(false)}
          onSave={async (body) => { putToday(sleepHabit.id, await habitApi.set(sleepHabit.id, now, body)); setError(null); }} />
      )}
      {deleting && (
        <ConfirmDialog title={`Delete “${deleting.name}”?`} body="Its whole history goes with it. Archive it instead to keep the history." confirmLabel="Delete" danger
          onClose={() => setDeleting(null)}
          onConfirm={async () => {
            await habitApi.remove(deleting.id);
            setHabits((hs) => (hs ?? []).filter((x) => x.id !== deleting.id));
            setDetailId(null);
            onChanged();
          }} />
      )}
    </div>
  );
}

const sleepPreset = (): Partial<HabitInput> => TEMPLATES.find((t) => t.kind === "sleep")!;

/** One habit for today: its control (tick, or − amount +), name and plan, streak, and the last 7 days. */
export function HabitRow({ habit: h, byDay, now, onToggle, onAmount, onSkip, onOpen }: {
  habit: Habit; byDay?: Map<string, HabitEntry>; now: string; onToggle: () => void; onAmount: (v: number) => void; onSkip: (on: boolean) => void; onOpen: () => void;
}) {
  const e = byDay?.get(now);
  const done = isDone(h, e);
  const skipped = isSkipped(e);
  const status = habitStatus(h, e);
  const streak = currentStreak(h, byDay, now);
  const amount = h.kind === "count" || h.kind === "duration";
  const step = h.kind === "duration" ? (h.target >= 60 ? 15 : 5) : Math.max(1, Math.round(goal(h) / 10));
  const [draft, setDraft] = useState<string | null>(null);
  const week = Array.from({ length: 7 }, (_, i) => addDays(now, i - 6));

  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-3 px-4 py-4 sm:flex-nowrap sm:px-5">
      {/* The same tick box as a task. On a count or time habit it fills the goal in one go (or clears it). */}
      <button type="button" onClick={() => (amount ? onAmount(done ? 0 : goal(h)) : onToggle())} aria-pressed={done}
        aria-label={done ? `Undo ${h.name}` : h.kind === "quit" ? `Avoided ${h.name} today` : `Mark ${h.name} as done`}
        className={cn("mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center self-start rounded-[6px] border transition-colors duration-150", done ? "border-ink bg-ink text-canvas" : "border-overlay/30")}>
        {done && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
      </button>
      <button type="button" onClick={onOpen} className="min-w-0 flex-1 text-left">
        <span className={cn("block break-words", done || skipped ? "text-ink-faint" : "text-ink", done && "line-through")}>{h.name}</span>
        <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-faint">
          <Badge tone={status === "completed" ? "blue" : status === "in-progress" ? "amber" : "neutral"}>{STATUS_LABEL[status]}</Badge>
          <span>{h.kind === "quit" ? (done ? "Avoided today" : "Tick when you've avoided it today") : goalLabel(h) ? `Goal ${goalLabel(h)}` : kindLabel(h.kind)}</span>
          <span>· {daysLabel(h.days)}</span>
          {streak > 0 && <span className="inline-flex items-center gap-1 text-ink-muted"><Flame className="h-3 w-3" aria-hidden />{streak} {streak === 1 ? "day" : "days"}</span>}
        </span>
        {h.cue && <span className="mt-1 block truncate text-xs italic text-ink-faint">{h.cue}</span>}
      </button>
      <span className="hidden items-center gap-1 md:flex" aria-label="Last 7 days">
        {week.map((d) => {
          const p = progress(h, byDay?.get(d));
          const planned = isPlanned(h, d);
          const sk = isSkipped(byDay?.get(d));
          return <span key={d} title={`${dayLabel(d, now)}: ${sk ? "skipped" : p >= 1 ? "done" : p > 0 ? `${Math.round(p * 100)}%` : planned ? (d === now ? "not yet" : "missed") : "not planned"}`}
            className={cn("h-2.5 w-2.5", sk ? "border border-ink/40" : p >= 1 ? "bg-ink" : p > 0 ? "bg-ink/40" : planned ? "bg-overlay/15" : "border border-dashed border-overlay/15")} />;
        })}
      </span>
      {amount && !skipped && (
        <div className="ml-10 flex shrink-0 items-center gap-1 sm:ml-0">
          <button type="button" onClick={() => onAmount((e?.value ?? 0) - step)} disabled={!e} aria-label={`Less ${h.name}`} className="grid h-8 w-8 place-items-center border border-overlay/15 text-ink-muted disabled:opacity-30"><Minus className="h-4 w-4" /></button>
          <label className="flex items-baseline gap-1 px-1 text-sm tabular-nums">
            <input value={draft ?? String(e?.value ?? 0)} inputMode="numeric" aria-label={`${h.name} today`}
              onFocus={(ev) => { setDraft(String(e?.value ?? 0)); ev.target.select(); }}
              onChange={(ev) => setDraft(ev.target.value.replace(/[^\d]/g, "").slice(0, 6))}
              onBlur={() => { if (draft !== null && Number(draft || 0) !== (e?.value ?? 0)) onAmount(Number(draft || 0)); setDraft(null); }}
              onKeyDown={(ev) => { if (ev.key === "Enter") (ev.target as HTMLInputElement).blur(); }}
              className="w-14 border-b border-overlay/20 bg-transparent text-right text-ink outline-none focus:border-ink" />
            <span className="whitespace-nowrap text-ink-faint">/ {h.kind === "duration" ? `${h.target} min` : h.target.toLocaleString()}</span>
          </label>
          <button type="button" onClick={() => onAmount((e?.value ?? 0) + step)} aria-label={`More ${h.name}`} className="grid h-8 w-8 place-items-center border border-overlay/15 text-ink"><Plus className="h-4 w-4" /></button>
        </div>
      )}
      {/* Skip today (or undo the skip) in a round liquid glass button. */}
      {(skipped || !done) && (
        <div className="ml-10 flex shrink-0 items-center sm:ml-0">
          <GlassRound onClick={() => onSkip(!skipped)} label={skipped ? `Undo skip of ${h.name}` : `Skip ${h.name} today`}
            title={skipped ? "Undo skip" : "Skip today: not done, not missed, the streak stays"}>
            {skipped ? <Undo2 className="h-4 w-4" /> : <SkipForward className="h-4 w-4" />}
          </GlassRound>
        </div>
      )}
    </li>
  );
}

/** A small round liquid glass icon button (Skip / Undo skip on a habit). */
function GlassRound({ onClick, label, title, children }: { onClick: () => void; label: string; title: string; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} aria-label={label} title={title}
      className="glass-fab relative grid h-9 w-9 shrink-0 place-items-center rounded-full text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-medium">
      <span className="pointer-events-none absolute inset-0" aria-hidden><LiquidGlass width="100%" height="100%" radius={18} blur={3} /></span>
      <span className="pointer-events-none relative">{children}</span>
    </button>
  );
}

/** Sleep: last night, the last 14 nights against the goal, and averages (bed time, wake time, quality, sleep debt). */
function SleepCard({ habit, byDay, onLog, onStart, onOpen }: { habit?: Habit; byDay?: Map<string, HabitEntry>; onLog: () => void; onStart: () => void; onOpen: () => void }) {
  const now = today();
  if (!habit) {
    return (
      <Card className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Moon className="h-6 w-6 text-ink-muted" aria-hidden />
          <div>
            <p className="text-ink">Track your sleep</p>
            <p className="text-sm text-ink-muted">Log when you went to bed and woke up; see hours, quality and sleep debt.</p>
          </div>
        </div>
        <GlassButton type="button" onClick={onStart}><Plus className="h-4 w-4" />Start tracking sleep</GlassButton>
      </Card>
    );
  }
  const last = byDay?.get(now);
  const nights = Array.from({ length: 14 }, (_, i) => addDays(now, i - 13));
  const week = nights.slice(7).map((d) => byDay?.get(d)).filter((e): e is HabitEntry => !!e);
  const avg = week.length ? Math.round(week.reduce((a, e) => a + e.value, 0) / week.length) : null;
  const debt = week.reduce((a, e) => a + Math.max(0, habit.target - e.value), 0);
  const q = week.filter((e) => e.quality).map((e) => e.quality!);
  const bed = averageClock(week.map((e) => e.bedTime).filter((t): t is string => !!t));
  const wake = averageClock(week.map((e) => e.wakeTime).filter((t): t is string => !!t));
  const max = Math.max(habit.target + 120, ...nights.map((d) => byDay?.get(d)?.value ?? 0));

  return (
    <Card className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <button type="button" onClick={onOpen} className="text-left">
          <p className="flex items-center gap-2 text-sm uppercase tracking-wide text-ink-muted"><Moon className="h-4 w-4" aria-hidden />Sleep · last night</p>
          {last ? (
            <p className="mt-2">
              <span className="font-display text-3xl text-ink">{minutesLabel(last.value)}</span>
              <span className="ml-3 text-sm text-ink-muted">{last.bedTime && last.wakeTime && `${clock(last.bedTime)} – ${clock(last.wakeTime)}`}{last.quality ? ` · ${["Poor", "Restless", "Okay", "Good", "Great"][last.quality - 1]}` : ""}</span>
            </p>
          ) : <p className="mt-2 text-ink-faint">Not logged yet. Goal {minutesLabel(habit.target)}.</p>}
        </button>
        <GlassButton type="button" strong={!last} onClick={onLog}><BedDouble className="h-4 w-4" />{last ? "Edit last night" : "Log last night"}</GlassButton>
      </div>

      <div>
        <div className="relative flex h-32 items-end gap-1.5" aria-label="Last 14 nights">
          <span className="pointer-events-none absolute inset-x-0 border-t border-dashed border-ink/40" style={{ bottom: `${(habit.target / max) * 100}%` }} aria-hidden />
          <span className="pointer-events-none absolute right-0 -translate-y-full pb-0.5 text-[10px] text-ink-faint" style={{ bottom: `${(habit.target / max) * 100}%` }}>goal {minutesLabel(habit.target)}</span>
          {nights.map((d) => {
            const e = byDay?.get(d);
            return (
              <div key={d} className="flex h-full flex-1 flex-col justify-end" title={`${dayLabel(d, now)}: ${e ? minutesLabel(e.value) : "not logged"}`}>
                <div className={cn("w-full transition-all", e ? (e.value >= habit.target ? "bg-ink" : "bg-ink/40") : "h-px bg-overlay/15")} style={e ? { height: `${(e.value / max) * 100}%` } : undefined} />
              </div>
            );
          })}
        </div>
        <div className="mt-1.5 flex gap-1.5 text-center text-[10px] text-ink-faint">
          {nights.map((d) => <span key={d} className="flex-1">{["M", "T", "W", "T", "F", "S", "S"][(new Date(d + "T12:00").getDay() + 6) % 7]}</span>)}
        </div>
      </div>

      <dl className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-5">
        <div><dt className="text-ink-muted">7-night average</dt><dd className="mt-1 text-ink">{avg === null ? "–" : minutesLabel(avg)}</dd></div>
        <div><dt className="text-ink-muted">Sleep debt (7 nights)</dt><dd className="mt-1 text-ink">{week.length ? minutesLabel(debt) : "–"}</dd></div>
        <div><dt className="flex items-center gap-1 text-ink-muted"><Moon className="h-3.5 w-3.5" aria-hidden />Usual bed time</dt><dd className="mt-1 text-ink">{bed ? clock(bed) : "–"}</dd></div>
        <div><dt className="flex items-center gap-1 text-ink-muted"><Sunrise className="h-3.5 w-3.5" aria-hidden />Usual wake time</dt><dd className="mt-1 text-ink">{wake ? clock(wake) : "–"}</dd></div>
        <div><dt className="text-ink-muted">Quality</dt><dd className="mt-1 text-ink">{q.length ? `${(q.reduce((a, b) => a + b, 0) / q.length).toFixed(1)} / 5` : "–"}</dd></div>
      </dl>
    </Card>
  );
}
