"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BedDouble, Check, ChevronDown, Eye, FileUp, Flame, Minus, Moon, MoreHorizontal, NotebookPen, Plus, Sunrise, Trash2, Undo2 } from "lucide-react";
import { Badge, Card, ConfirmDialog, Empty, Stat } from "@/components/ui";
import { GlassButton } from "@/components/GlassButton";
import LiquidGlass from "@/components/LiquidGlass";
import { PanelLoader } from "@/components/WheelSpinner";
import OptionWheel from "@/components/OptionWheel";
import { ClockPopup, NotesPopup } from "@/components/TaskDialogs";
import { DropdownMenu, QuietSelect, YearSelect, yearOptions, type DropdownGroup } from "@/components/GlassDropdown";
import { HabitDetail, HabitEditor, HabitGrid, habitDayLine, Segmented, SleepDialog, levelOf } from "@/components/HabitDialogs";
import { ApiError } from "@/lib/api";
import { readHabitCsv } from "@/lib/habitCsv";
import { addDays, clock, dayLabel, longDay, today } from "@/lib/days";
import {
  TEMPLATES, averageClock, categoryLabel, toggleDay, currentStreak, daysLabel, goal, goalLabel, habitApi, habitStatus, indexEntries, isDone, isDue, isPlanned, isSkipped, kindLabel, STATUS_LABEL, minutesLabel, progress, successRate,
  type EntryIndex, type Habit, type HabitEntry, type HabitInput, type HabitScale,
} from "@/lib/habits";
import { cn } from "@/lib/utils";

/** The habit tracker types, as the filter at the top: by size (micro → macro), habits to quit, and sleep. */
type Filter = "all" | HabitScale | "quit" | "sleep";
const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "All" }, { id: "micro", label: "Micro" }, { id: "daily", label: "Daily" }, { id: "macro", label: "Macro" }, { id: "quit", label: "Quit" },
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
  /** The year the consistency grids show (All habits and each habit's own), picked in their year dropdown. */
  const [year, setYear] = useState(() => Number(today().slice(0, 4)));
  /** What the consistency grid shows: "all", a type ("cat:learning") or one habit ("habit:<id>"). */
  const [scope, setScope] = useState("all");
  const fileRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const recentFrom = addDays(today(), -HISTORY_DAYS);
      // An earlier year than the recent history covers is read on its own and added to the check-ins.
      const older = `${year}-01-01` < recentFrom;
      const [h, e, y] = await Promise.all([
        habitApi.list(),
        habitApi.entries(recentFrom, today()),
        older ? habitApi.entries(`${year}-01-01`, `${year}-12-31` < recentFrom ? `${year}-12-31` : addDays(recentFrom, -1)) : Promise.resolve([]),
      ]);
      setHabits(h);
      setIndex(indexEntries([...y, ...e]));
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError && e.status === 404
        ? "The habit tracker needs the latest backend. Push the backend (git push) so Render deploys it, then reload."
        : e instanceof Error ? e.message : "Could not load your habits.");
      setHabits((h) => h ?? []);
    }
  }, [year]);
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

  /** One of the last 7 days ticked or unticked (the day circles): shown at once, then saved. */
  async function setDay(h: Habit, day: string) {
    const before = index.get(h.id)?.get(day) ?? null;
    const put = (entry: HabitEntry | null) => setIndex((prev) => {
      const next = new Map(prev);
      const days = new Map(next.get(h.id) ?? []);
      if (entry) days.set(day, entry); else days.delete(day);
      next.set(h.id, days);
      return next;
    });
    put(isDone(h, before) ? null : { id: "local", habitId: h.id, day, value: h.kind === "count" || h.kind === "duration" ? h.target : 1, bedTime: null, wakeTime: null, quality: null, note: "" });
    try { put(await toggleDay(h, day, before)); setError(null); onChanged(); } catch (e) { put(before); setError(e instanceof Error ? e.message : "Could not save."); }
  }

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
  /** Habits from a CSV (its own file, separate from the Tasks CSV): each row becomes a habit. */
  async function importFile(file: File) {
    if (importing) return;
    if (/\.(xlsx|xls|ods|numbers)$/i.test(file.name)) {
      setNotice("Save the sheet as CSV first (Google Sheets: File → Download → CSV; Excel: Save As → CSV).");
      return;
    }
    const read = readHabitCsv(await file.text(), habits ?? []);
    if ("error" in read) { setNotice(read.error); return; }
    setImporting(true);
    const failed: string[] = [];
    const added: Habit[] = [];
    for (const input of read.habits) {
      try { added.push(await habitApi.create(input)); }
      catch (e) { failed.push(`${input.name}: ${e instanceof Error ? e.message : "could not save"}`); }
    }
    setImporting(false);
    if (added.length) { setHabits((hs) => [...(hs ?? []), ...added]); onChanged(); }
    const left = [...read.skipped, ...failed];
    setNotice(`Added ${added.length} habit${added.length === 1 ? "" : "s"} from ${file.name}.${left.length ? ` Skipped ${left.length}: ${left.join("; ")}.` : ""}`);
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

  /** This year back to the year of the oldest habit (at least two years back), for the year dropdown. */
  const years = useMemo(() => yearOptions((habits ?? []).reduce((y, h) => Math.min(y, Number(h.startDay.slice(0, 4)) || y), Number(now.slice(0, 4)))), [habits, now]);
  /** The habits the consistency grid covers: those of the filter at the top (All, Micro, Daily, Macro, Quit). */
  const base = useMemo(() => (filter === "all" ? active : active.filter((h) => h.kind !== "sleep" && (filter === "quit" ? h.kind === "quit" : h.scale === filter))), [active, filter]);
  const allLabel = filter === "all" ? "All habits" : `All ${FILTERS.find((f) => f.id === filter)?.label.toLowerCase() ?? ""} habits`;
  /** The grid's dropdown: all of them, each type (category) in use, and each habit. */
  const scopeGroups = useMemo<DropdownGroup[]>(() => {
    const cats = [...new Set(base.map((h) => h.category))];
    return [
      { title: "", items: [{ id: "all", label: allLabel }] },
      ...(cats.length ? [{ title: "Types", items: cats.map((c) => ({ id: `cat:${c}`, label: categoryLabel(c), meta: String(base.filter((h) => h.category === c).length) })) }] : []),
      { title: "Habits", items: base.map((h) => ({ id: `habit:${h.id}`, label: h.name })) },
    ];
  }, [base, allLabel]);
  // A habit archived (or a type left empty) since it was picked goes back to all habits.
  const scopeOk = scope === "all" || scopeGroups.some((g) => g.items.some((i) => i.id === scope));
  const shownScope = scopeOk ? scope : "all";
  const scopeLabel = scopeGroups.flatMap((g) => g.items).find((i) => i.id === shownScope)?.label ?? allLabel;
  /**
   * The chosen habits (all, a type, or one), one calendar year: the share of planned habits done each day, and in
   * the day's tooltip which ones were done.
   */
  const overall = useMemo(() => {
    const pool = shownScope === "all" ? base
      : shownScope.startsWith("cat:") ? base.filter((h) => h.category === shownScope.slice(4))
      : base.filter((h) => h.id === shownScope.slice(6));
    const out = [];
    for (let d = `${year}-01-01`; d <= `${year}-12-31`; d = addDays(d, 1)) {
      if (d > now) { out.push({ day: d, level: 0, off: true, title: `${longDay(d)}: not yet` }); continue; }
      if (pool.length === 1) {
        const h = pool[0];
        const e = index.get(h.id)?.get(d);
        const planned = isPlanned(h, d);
        const label = e?.skipped ? "skipped" : e ? (h.kind === "count" ? `${e.value} ${h.unit}`.trim() : h.kind === "duration" || h.kind === "sleep" ? minutesLabel(e.value) : "done") : planned ? "missed" : "not planned";
        out.push({ day: d, level: levelOf(progress(h, e)), off: (!planned && !e) || !!e?.skipped, title: `${longDay(d)}: ${d === now && !e ? "not yet" : label}`, lines: planned || e ? [habitDayLine(h, e, d, now)] : [] });
        continue;
      }
      const planned = pool.filter((h) => isDue(h, d, index.get(h.id)?.get(d)));
      const done = planned.filter((h) => isDone(h, index.get(h.id)?.get(d))).length;
      // Any habit practised that day counts, whatever its type and even on a day it was not planned: the day shows
      // how much of everything practised or planned was done, and is never empty once something was practised.
      const practised = pool.filter((h) => progress(h, index.get(h.id)?.get(d)) > 0);
      const counted = new Set([...planned, ...practised]);
      const share = counted.size ? practised.reduce((a, h) => a + progress(h, index.get(h.id)?.get(d)), 0) / counted.size : 0;
      // Every habit of the day in the card: the planned ones, and any checked in on a day it was not planned.
      const lines = pool.filter((h) => isPlanned(h, d) || index.get(h.id)?.has(d)).map((h) => habitDayLine(h, index.get(h.id)?.get(d), d, now));
      out.push({ day: d, level: practised.length ? Math.max(1, levelOf(share)) : 0, off: !counted.size,
        title: `${longDay(d)}: ${!counted.size ? "no habits planned" : `${practised.length} practised${planned.length ? ` · ${done} of ${planned.length} planned done` : ""}`}`, lines });
    }
    return out;
  }, [base, index, now, year, shownScope]);

  if (!habits) return <PanelLoader label="Loading habits" />;

  return (
    <div className="flex flex-col gap-8 pb-40">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <Stat className="pw-card" label="Done today" value={plannedToday.length ? `${doneToday} / ${plannedToday.length}` : "–"} hint={plannedToday.length && doneToday === plannedToday.length ? "Everything done. Nice." : undefined} />
        <Stat className="pw-card" label="Perfect days in a row" value={perfect} hint="Every planned habit done" />
        <div className="col-span-2 lg:col-span-1"><Stat className="pw-card" label="Last 30 days" value={score === null ? "–" : `${score}%`} hint={bestNow.n ? `Longest streak now: ${bestNow.name}, ${bestNow.n}` : "Planned days done"} /></div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* Phones: a segmented control and a blue New habit button. */}
        <div className="w-full md:hidden"><Segmented soft label="Habit type" value={filter} options={FILTERS} onChange={setFilter} /></div>
        <div className="hidden md:block"><Segmented label="Habit type" value={filter} options={FILTERS} onChange={setFilter} /></div>
        <button type="button" onClick={() => setEditing({ preset: filter === "sleep" ? sleepPreset() : filter === "quit" ? { kind: "quit" } : filter !== "all" ? { scale: filter } : undefined })}
          className="inline-flex h-10 items-center gap-2 rounded-full bg-[#3478F6] px-5 text-[15px] font-medium text-white shadow-themed active:scale-[0.97] md:hidden">
          <Plus className="h-4 w-4" strokeWidth={2.25} />New habit
        </button>
        <GlassButton type="button" strong className="max-md:hidden" onClick={() => setEditing({ preset: filter === "sleep" ? sleepPreset() : filter === "quit" ? { kind: "quit" } : filter !== "all" ? { scale: filter } : undefined })}>
          <Plus className="h-4 w-4" />New habit
        </GlassButton>
      </div>

      <div className="-mt-5 flex flex-col gap-2">
        {/* Habits have their own CSV (Name, Type, Size, Category, Goal, Unit, Days, Time, Cue); tasks are imported in Tasks. */}
        <button type="button" disabled={importing} onClick={() => fileRef.current?.click()} className="group inline-flex items-center gap-3 self-start text-sm text-ink outline-none disabled:opacity-60">
          <span className="glass-fab relative grid h-10 w-10 shrink-0 place-items-center rounded-full group-focus-visible:outline group-focus-visible:outline-2 group-focus-visible:outline-offset-2 group-focus-visible:outline-accent-medium">
            <span className="pointer-events-none absolute inset-0" aria-hidden><LiquidGlass width="100%" height="100%" radius={20} blur={3} /></span>
            <FileUp className="relative h-[18px] w-[18px]" strokeWidth={1.75} aria-hidden />
          </span>
          {importing ? "Importing…" : "Import habits CSV"}
        </button>
        <input ref={fileRef} type="file" accept=".csv,.tsv,.txt,text/csv,text/tab-separated-values,.xlsx,.xls,.ods,.numbers" className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void importFile(f); }} />
        {notice && <p className="text-xs text-ink-muted" role="status">{notice}</p>}
      </div>

      {error && <p className="text-sm text-accent-extreme" role="alert">{error}</p>}

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
                    <ul className="flex flex-col gap-3 md:gap-0 md:divide-y md:divide-overlay/10 md:border md:border-overlay/10 md:bg-canvas-raised">
                      {list.map((h) => <HabitRow key={h.id} card habit={h} byDay={index.get(h.id)} now={now} onToggle={() => void toggle(h)} onAmount={(v) => setAmount(h, v)} onSkip={(on) => void skip(h, on)} onOpen={() => setDetailId(h.id)} onDay={(d) => void setDay(h, d)} />)}
                    </ul>
                  </div>
                );
              })}
              {restList.length > 0 && (
                <div>
                  <h3 className="mb-2 text-sm uppercase tracking-wide text-ink-muted">Not planned today</h3>
                  <ul className="flex flex-col gap-3 md:gap-0 md:divide-y md:divide-overlay/10 md:border md:border-overlay/10 md:bg-canvas-raised">
                    {restList.map((h) => <HabitRow key={h.id} card habit={h} byDay={index.get(h.id)} now={now} onToggle={() => void toggle(h)} onAmount={(v) => setAmount(h, v)} onSkip={(on) => void skip(h, on)} onOpen={() => setDetailId(h.id)} onDay={(d) => void setDay(h, d)} />)}
                  </ul>
                </div>
              )}
            </section>
          )}
        </>
      )}

      {filter !== "sleep" && base.length > 0 && (
        <Card className="pw-card">
          <div className="mb-4 flex items-center justify-between gap-3">
            <QuietSelect value={shownScope} display={scopeLabel} groups={scopeGroups} onSelect={setScope} label="Show" className="text-sm uppercase tracking-wide text-ink-muted" />
            <YearSelect year={year} years={years} onChange={setYear} className="text-sm text-ink-muted" />
          </div>
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
        <HabitDetail habit={detail} byDay={index.get(detail.id)} year={year} years={years} onYear={setYear} onClose={() => setDetailId(null)}
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
export function HabitRow({ habit: h, byDay, now, onToggle, onAmount, onSkip, onOpen, card = false, onDelete, onNotes, onDay, className }: {
  habit: Habit; byDay?: Map<string, HabitEntry>; now: string; onToggle: () => void; onAmount: (v: number) => void; onSkip: (on: boolean) => void; onOpen: () => void;
  /** Phones: a rounded card with a round check, like a task card (used in the Tasks list). */
  card?: boolean;
  /** When given: Delete in the row's ⋯ menu (the caller asks to confirm). */
  onDelete?: () => void;
  /** When given: Notes in the row's ⋯ menu, your own notes on this habit (saved through this). */
  onNotes?: (notes: string) => Promise<void>;
  /** Extra classes on the row (e.g. the slide-away when it moves to Done). */
  className?: string;
  /** Tick or untick one of the last 7 days (the day circles). */
  onDay?: (day: string) => void;
}) {
  const e = byDay?.get(now);
  const done = isDone(h, e);
  const skipped = isSkipped(e);
  const status = habitStatus(h, e);
  const streak = currentStreak(h, byDay, now);
  const amount = h.kind === "count" || h.kind === "duration";
  const step = h.kind === "duration" ? (h.target >= 60 ? 15 : 5) : Math.max(1, Math.round(goal(h) / 10));
  const [wheel, setWheel] = useState(false);
  const [notesOpen, setNotesOpen] = useState<"add" | "view" | null>(null);

  return (
    <li className={cn("flex flex-wrap items-center gap-x-4 gap-y-3 px-4 py-4 sm:flex-nowrap sm:px-5", card && "pw-card max-md:items-start max-md:gap-x-3 max-md:rounded-[28px] max-md:bg-canvas-raised max-md:p-3 max-md:pr-3.5", className)}>
      {/* The same tick box as a task. On a count or time habit it fills the goal in one go (or clears it). */}
      <button type="button" onClick={() => (amount ? onAmount(done ? 0 : goal(h)) : onToggle())} aria-pressed={done}
        aria-label={done ? `Undo ${h.name}` : h.kind === "quit" ? `Avoided ${h.name} today` : `Mark ${h.name} as done`}
        className={cn(card && "max-md:ml-1.5 max-md:mt-2.5", "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center self-start rounded-[6px] border transition-colors duration-150", done ? "border-ink bg-ink text-canvas" : "border-overlay/30")}>
        {done && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
      </button>
      <button type="button" onClick={onOpen} className={cn("min-w-0 flex-[1_1_12rem] text-left sm:flex-1", card && "max-md:pt-2.5")}>
        <span className={cn("block break-words", done || skipped ? "text-ink-faint" : "text-ink", done && "line-through", card && "max-md:text-[17px] max-md:leading-snug")}>{h.name}</span>
        <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-faint">
          <Badge tone={status === "completed" ? "blue" : status === "in-progress" ? "amber" : "neutral"} className={card ? "max-md:rounded-full" : undefined}>{STATUS_LABEL[status]}</Badge>
          <span>{h.kind === "quit" ? (done ? "Avoided today" : "Tick when you've avoided it today") : goalLabel(h) ? `Goal ${goalLabel(h)}` : kindLabel(h.kind)}</span>
          <span>· {daysLabel(h.days)}</span>
          {h.time && <span>· {clock(h.time)}</span>}
          {streak > 0 && <span className="inline-flex items-center gap-1 text-ink-muted"><Flame className="h-3 w-3" aria-hidden />{streak} {streak === 1 ? "day" : "days"}</span>}
        </span>
        {h.cue && <span className="mt-1 block truncate text-xs italic text-ink-faint">{h.cue}</span>}
      </button>
      {amount && !skipped && (
        <div className="order-3 ml-10 flex shrink-0 items-center gap-1 sm:order-none sm:ml-0">
          <button type="button" onClick={() => onAmount((e?.value ?? 0) - step)} disabled={!e} aria-label={`Less ${h.name}`} className="grid h-8 w-8 place-items-center border border-overlay/15 text-ink-muted disabled:opacity-30"><Minus className="h-4 w-4" /></button>
          {/* Tap the amount to pick it on the Pacewise option wheel (scroll or drag up and down). */}
          <button type="button" onClick={() => setWheel(true)} aria-label={`${h.name} today: ${e?.value ?? 0}. Pick on the wheel`}
            className="flex items-baseline gap-1 px-1 text-sm tabular-nums">
            <span className="min-w-[3.5rem] border-b border-overlay/20 text-right text-ink">{e?.value ?? 0}</span>
            <span className="whitespace-nowrap text-ink-faint">/ {h.kind === "duration" ? `${h.target} min` : h.target.toLocaleString()}</span>
          </button>
          <button type="button" onClick={() => onAmount((e?.value ?? 0) + step)} aria-label={`More ${h.name}`} className="grid h-8 w-8 place-items-center border border-overlay/15 text-ink"><Plus className="h-4 w-4" /></button>
        </div>
      )}
      {wheel && <AmountWheel habit={h} value={e?.value ?? 0} step={step} onChange={onAmount} onClose={() => setWheel(false)} />}
      {/* Skip today (or undo the skip) in a round liquid glass button. */}
      {(skipped || onDelete || onNotes) && (
        <div className="order-2 ml-auto flex shrink-0 items-center gap-2 self-start sm:order-none sm:ml-0 sm:self-center">
          {/* The Skip button is gone; a day skipped before can still be un-skipped. */}
          {skipped && (
            <GlassRound onClick={() => onSkip(false)} label={`Undo skip of ${h.name}`} title="Undo skip">
              <Undo2 className="h-4 w-4" />
            </GlassRound>
          )}
          {(onDelete || onNotes) && <HabitMenu name={h.name} onNotes={onNotes ? () => setNotesOpen("add") : undefined} onViewNotes={onNotes && h.notes?.trim() ? () => setNotesOpen("view") : undefined} onDelete={onDelete} />}
        </div>
      )}
      {notesOpen && onNotes && <NotesPopup title={`${notesOpen === "view" ? "Notes" : "Add note"} · ${h.name}`} value={h.notes ?? ""} readOnly={notesOpen === "view"} onSave={onNotes} onClose={() => setNotesOpen(null)} />}
    </li>
  );
}

/**
 * The Pacewise option wheel (components/OptionWheel.tsx, copied from Pacewise) for a count or time habit: scroll or
 * drag to add or take away, in the row's steps (5 or 15 minutes, or a tenth of the goal), up to twice the goal.
 */
function AmountWheel({ habit: h, value, step, onChange, onClose }: { habit: Habit; value: number; step: number; onChange: (v: number) => void; onClose: () => void }) {
  const values = useMemo(() => {
    const cap = h.kind === "duration" ? 1440 : 100000;
    const top = Math.min(cap, Math.max(goal(h) * 2, value, h.kind === "duration" ? 60 : 10));
    const list: number[] = [];
    for (let v = 0; v <= top && list.length < 400; v += step) list.push(v);
    if (!list.includes(value)) list.push(value);
    if (!list.includes(goal(h)) && goal(h) <= cap) list.push(goal(h));
    return list.sort((a, b) => a - b);
  }, [h, value, step]);
  const label = (v: number) => (h.kind === "duration" ? minutesLabel(v) : `${v.toLocaleString()}${h.unit ? ` ${h.unit}` : ""}`);
  return (
    <ClockPopup title={h.name} onClose={onClose}>
      <p className="-mt-2 text-sm text-ink-muted">Goal {goalLabel(h)}. Scroll or drag to add or take away.</p>
      <div className="relative h-64">
        <span className="pointer-events-none absolute inset-x-0 top-1/2 h-12 -translate-y-1/2 border-y border-overlay/15 bg-overlay/[0.04]" aria-hidden />
        <OptionWheel
          items={values.map(label)}
          defaultSelected={Math.max(0, values.indexOf(value))}
          textColor="rgb(var(--ink-faint))"
          activeColor="rgb(var(--ink))"
          side="left"
          fontSize={1.75}
          spacing={1.6}
          curve={1}
          tilt={8}
          blur={1.5}
          fade={0.28}
          smoothing={160}
          inset={24}
          loop={false}
          draggable
          onChange={(i) => onChange(values[i])}
        />
      </div>
    </ClockPopup>
  );
}

/** The ⋯ on a habit, like a task's: Add note (and View notes when there are some) and Delete. */
function HabitMenu({ name, onNotes, onViewNotes, onDelete }: { name: string; onNotes?: () => void; onViewNotes?: () => void; onDelete?: () => void }) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const items = [
    ...(onNotes ? [{ id: "notes", label: "Add note", icon: NotebookPen }] : []),
    ...(onViewNotes ? [{ id: "view", label: "View notes", icon: Eye }] : []),
    ...(onDelete ? [{ id: "delete", label: "Delete", icon: Trash2, danger: true }] : []),
  ];
  return (
    <>
      <button ref={trigger} type="button" onClick={() => setOpen((o) => !o)} aria-haspopup="listbox" aria-expanded={open} aria-label={`${name}: actions`}
        className="pw-circle-btn grid h-9 w-9 shrink-0 place-items-center rounded-full text-ink active:scale-95">
        <MoreHorizontal className="h-4 w-4" />
      </button>
      {open && (
        <DropdownMenu soft anchor={trigger} label="Habit actions" value="" minWidth={200}
          ghost={<span className="pw-circle-btn grid h-full w-full place-items-center rounded-full text-ink"><MoreHorizontal className="h-4 w-4" /></span>} onClose={() => setOpen(false)}
          groups={[{ title: "", items }]}
          onSelect={(id) => (id === "notes" ? onNotes?.() : id === "view" ? onViewNotes?.() : onDelete?.())} />
      )}
    </>
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
