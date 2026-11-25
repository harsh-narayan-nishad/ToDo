"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CalendarRange, Check, ChevronDown, Plus, Repeat2, Target, X } from "lucide-react";
import LiquidGlass from "@/components/LiquidGlass";
import { GlassButton } from "@/components/GlassButton";
import { TaskSheet, blankRow, findClashes, type SheetRow } from "@/components/TaskSheet";
import { FIELD, LABEL } from "@/components/ui";
import { addDays, longDay, today } from "@/lib/days";
import { titleProblem } from "@/lib/rules";
import { createBulk, type BulkResult, type Task } from "@/lib/todo";
import { tourState } from "@/lib/tour";
import { cn } from "@/lib/utils";
import { DropdownMenu, type DropdownGroup } from "@/components/GlassDropdown";
import { INTERVALS, MAX_RANGE_DAYS, PATTERNS, planDays, repeatLabel, span, weekday, type Repeat } from "@/lib/repeat";
import { ButtonWheel } from "@/components/WheelSpinner";
import { ClockPopup } from "@/components/TaskDialogs";
import { goalsApi, periodLabel, type Goal } from "@/lib/goals";
import { GoalSheet } from "@/components/GoalsPanel";

/**
 * The task planner: several tasks over many days in one go — a week of workouts, a month of revision,
 * weekdays only, once a week, once a month. Every task becomes its own one-day task (so each day can be
 * ticked off on its own) and is added with one request; the server checks each one with the normal rules.
 */
/** One plan adds at most this many rows (a repeating row is ONE task, however many days it covers). */
const MAX_ROWS = 50;
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

const parse = (day: string) => { const [y, m, d] = day.split("-").map(Number); return new Date(y, m - 1, d, 12); };
const monthEnd = (day: string) => { const d = parse(day); return addDays(day, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate() - d.getDate()); };
const short = (day: string) => parse(day).toLocaleDateString(undefined, { day: "numeric", month: "short" });

function presets(now: string): { label: string; from: string; to: string }[] {
  return [
    { label: "This week", from: now, to: addDays(now, 6 - weekday(now)) },
    { label: "Next 7 days", from: now, to: addDays(now, 6) },
    { label: "Next 2 weeks", from: now, to: addDays(now, 13) },
    { label: "This month", from: now, to: monthEnd(now) },
    { label: "Next 30 days", from: now, to: addDays(now, 29) },
    { label: "Next year", from: now, to: addDays(now, 364) },
    { label: "Next 2 years", from: now, to: addDays(now, 729) },
  ];
}

/**
 * Auto-save: what is typed in the planner (the rows and the When settings) is kept on this device as it changes,
 * so closing the planner by mistake (Back, Esc, a tap outside) loses nothing. It comes back the next time the
 * planner opens, and is cleared once the plan is added (or when every row is empty again).
 */
export const PLANNER_DRAFT_KEY = "pacewise-todo-planner-draft";
interface Draft { rows: Omit<SheetRow, "key">[]; from: string; to: string; repeat: Repeat; picked: boolean[] }
function loadDraft(now: string): Draft | null {
  try {
    const d = JSON.parse(localStorage.getItem(PLANNER_DRAFT_KEY) ?? "null") as Draft | null;
    if (!d || !Array.isArray(d.rows) || !d.rows.length) return null;
    // A range that has started in the past moves to today (the planner never plans past days).
    if (d.from < now) { d.to = d.to < now ? addDays(now, Math.max(0, span(d.from, d.to))) : d.to; d.from = now; }
    return d;
  } catch { return null; }
}
const clearDraft = () => { try { localStorage.removeItem(PLANNER_DRAFT_KEY); } catch { /* storage blocked */ } };

export function TaskPlanner({ onClose, onCreated, neet = false, contests }: { onClose: () => void; onCreated: (tasks: Task[]) => void; neet?: boolean; /** The Contests menu, beside Import CSV. */ contests?: React.ReactNode }) {
  const now = today();
  const quick = useMemo(() => presets(now), [now]);
  const [draft] = useState(() => loadDraft(now));
  const [from, setFrom] = useState(draft?.from ?? now);
  const [to, setTo] = useState(draft?.to ?? addDays(now, 6));
  const [repeat, setRepeat] = useState<Repeat>(draft?.repeat ?? "daily");
  /** The goal every task in this plan counts toward ("" = none), from the person's goals still in progress. */
  const [goalId, setGoalId] = useState("");
  const [goals, setGoals] = useState<Goal[]>([]);
  /** "New goal…" in the Goal menu: the goal sheet, right here; the new goal is then picked for this plan. */
  const [newGoal, setNewGoal] = useState(false);
  useEffect(() => { goalsApi.list().then((g) => setGoals(g.filter((x) => x.status === "open")), () => undefined); }, []);
  const [picked, setPicked] = useState<boolean[]>(draft?.picked?.length === 7 ? draft.picked : [true, false, true, false, true, false, false]);
  const [rows, setRows] = useState<SheetRow[]>(() => draft ? draft.rows.map((r) => { const b = blankRow(); return { ...b, ...r, key: b.key }; }) : [blankRow(), blankRow(), blankRow()]);
  /** Saved on every change; nothing is kept while every row is empty. */
  const added = useRef(false);
  useEffect(() => {
    if (added.current) return;
    if (!rows.some((r) => r.title.trim() || r.notes.trim())) { clearDraft(); return; }
    const save: Draft = { rows: rows.map(({ key: _key, ...r }) => r), from, to, repeat, picked };
    try { localStorage.setItem(PLANNER_DRAFT_KEY, JSON.stringify(save)); } catch { /* storage blocked */ }
  }, [rows, from, to, repeat, picked]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<BulkResult | null>(null);
  /** "Custom dates" in the Range menu opens its own small popup with the first and last day. */
  const [customOpen, setCustomOpen] = useState(false);
  const preset = quick.find((p) => p.from === from && p.to === to);

  useEffect(() => {
    // Esc in the New goal sheet on top closes only that sheet, not the planner.
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape" && !document.querySelector('[role="dialog"][aria-label="New goal"]')) onClose(); };
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onClose]);

  const days = useMemo(() => planDays(from, to, repeat, picked), [from, to, repeat, picked]);
  /** The days one row lands on: its own Repeat if it has one, otherwise the plan's. */
  const daysFor = useMemo(() => {
    const cache = new Map<string, string[]>();
    return (r: SheetRow) => {
      if (!r.repeat) return days;
      if (!cache.has(r.repeat)) cache.set(r.repeat, planDays(from, to, r.repeat, picked));
      return cache.get(r.repeat) as string[];
    };
  }, [days, from, to, picked]);
  const filled = rows.filter((r) => r.title.trim());
  // Rows with their own Date are added on that day only; the rest repeat on every planned day.
  const repeating = filled.filter((r) => !r.day);
  const dated = filled.filter((r) => r.day);
  const total = repeating.reduce((n, r) => n + daysFor(r).length, 0) + dated.length;
  /** Every day at least one task lands on, for the preview. */
  const allDays = [...new Set([...repeating.flatMap((r) => daysFor(r)), ...dated.map((r) => r.day)])].sort();
  const clashes = useMemo(() => findClashes(rows, daysFor), [rows, daysFor]);
  const rangeProblem = from < now ? "The first day cannot be in the past." : to < from ? "The last day must be on or after the first day." : span(from, to) > MAX_RANGE_DAYS ? "Plan at most two years at a time." : null;
  const problem =
    rangeProblem ??
    (filled.length === 0 ? "Give at least one task a title." : null) ??
    filled.map((r) => titleProblem(r.title)).find(Boolean) ??
    filled.map((r) => (!r.allDay && r.endTime <= r.startTime ? `“${r.title.trim()}”: the end time must be after the start time.` : null)).find(Boolean) ??
    dated.filter((r) => r.day < now).map((r) => `“${r.title.trim()}”: its date is in the past.`)[0] ??
    repeating.filter((r) => daysFor(r).length === 0).map((r) => `“${r.title.trim()}”: no day in this range matches its repeat.`)[0] ??
    clashes.message ??
    (filled.length > MAX_ROWS ? `That is ${filled.length} tasks; one plan can add at most ${MAX_ROWS}.` : null);


  async function submit() {
    if (problem || busy) return;
    setBusy(true);
    setError(null);
    try {
      const task = (r: SheetRow, day: string) => ({ title: r.title.trim(), notes: r.notes.trim(), priority: r.priority, startDay: day, dueDay: day, startTime: r.allDay ? null : r.startTime, endTime: r.allDay ? null : r.endTime, goalId: r.goalId || goalId || null });
      const tasks = [...repeating.flatMap((r) => daysFor(r).map((day) => task(r, day))), ...dated.map((r) => task(r, r.day))].sort((x, y) => x.startDay.localeCompare(y.startDay));
      // The tour's practice task: made on this screen only (never saved), so the tour always works.
      if (tourState.virtual) {
        const at = new Date().toISOString();
        const practice: Task[] = tasks.map((t) => ({ ...t, id: `tour-${crypto.randomUUID()}`, status: "open", createdDay: now, completedDay: null, createdAt: at, loggedMinutes: 0 }));
        added.current = true;
        clearDraft();
        onCreated(practice);
        onClose();
        return;
      }
      // A row repeating on several days is ONE repeating task (with its days), not a task per day.
      const series = repeating.filter((r) => daysFor(r).length > 1).map((r) => ({ title: r.title.trim(), notes: r.notes.trim(), priority: r.priority, startTime: r.allDay ? null : r.startTime, endTime: r.allDay ? null : r.endTime, goalId: r.goalId || goalId || null, days: daysFor(r) }));
      const singles = [...repeating.filter((r) => daysFor(r).length === 1).map((r) => task(r, daysFor(r)[0])), ...dated.map((r) => task(r, r.day))];
      const res = await createBulk(singles, series);
      if (res.created.length) { added.current = true; clearDraft(); onCreated(res.created); }
      if (res.skipped.length === 0) { onClose(); return; }
      setResult(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not add the plan.");
    } finally {
      setBusy(false);
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-end justify-center bg-canvas/70 p-3 backdrop-blur-[48px] backdrop-saturate-150 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label="Task planner"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="glass-in relative w-full max-w-5xl">
        <span className="absolute inset-0" aria-hidden><LiquidGlass width="100%" height="100%" radius={28} blur={4} /></span>
        {/* the close button floats on the panel's frame: it stays put while the planner scrolls under it */}
        <button type="button" onClick={onClose} aria-label="Close" title="Close"
              className="glass-fab absolute right-4 top-4 z-20 grid h-11 w-11 shrink-0 sm:right-6 sm:top-6 place-items-center rounded-full text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-medium">
              <span className="absolute inset-0" aria-hidden><LiquidGlass width="100%" height="100%" radius={22} blur={4} /></span>
              <X className="relative h-5 w-5" strokeWidth={1.75} aria-hidden />
            </button>
        <div className="relative flex max-h-[90dvh] flex-col overflow-y-auto p-6 sm:p-8">
          <header className="mb-6 flex items-start justify-between gap-3 pr-14">
            <h2 className="flex items-center gap-2 self-center font-display text-2xl"><CalendarRange className="h-6 w-6" strokeWidth={1.5} aria-hidden />Task planner</h2>
          </header>

          {result ? (
            <Result result={result} onClose={onClose} />
          ) : (
            <div className="flex flex-col gap-8">
              {/* 1. When */}
              <Section n={1} title="When">
                {/* Range, Repeat and Goal as a row of chips (a quick-add bar): each opens its menu. */}
                <div className="flex flex-wrap items-center gap-2">
                  <span data-tour="range" className="contents">
                    <ChipSelect icon={CalendarRange} label="Range" value={preset?.label ?? "custom"} display={preset ? `${preset.label} · ${short(from)} – ${short(to)}` : `${short(from)} – ${short(to)}`}
                      groups={[
                        { title: "Quick ranges", items: quick.map((p) => ({ id: p.label, label: p.label, meta: `${short(p.from)} – ${short(p.to)}` })) },
                        { title: "Your own", items: [{ id: "custom", label: "Custom dates", meta: preset ? "pick days" : `${short(from)} – ${short(to)}` }] },
                      ]}
                      onSelect={(id) => { const p = quick.find((q) => q.label === id); if (p) { setFrom(p.from); setTo(p.to); } else setCustomOpen(true); }} />
                  </span>
                  <span data-tour="repeat" className="contents">
                    <ChipSelect icon={Repeat2} label="Repeat" value={repeat} display={repeatLabel(repeat)}
                      groups={[{ title: "Pattern", items: PATTERNS }, { title: "Interval", items: INTERVALS.map((x) => ({ ...x, meta: `${planDays(from, to, x.id, picked).length} days` })) }]}
                      onSelect={(id) => setRepeat(id as Repeat)} />
                  </span>
                  {/* Optional: the goal every task in this plan counts toward. */}
                  <ChipSelect icon={Target} label="Goal" value={goalId} display={goals.find((g) => g.id === goalId)?.title ?? "No goal"} muted={!goalId}
                    groups={[
                      { title: "", items: [{ id: "", label: "No goal" }] },
                      ...(goals.length ? [{ title: "Your goals", items: goals.map((g) => ({ id: g.id, label: g.title, meta: periodLabel(g.period) })) }] : []),
                      { title: "", items: [{ id: "__new", label: "New goal…", icon: Plus }] },
                    ]}
                    onSelect={(id) => (id === "__new" ? setNewGoal(true) : setGoalId(id))} />
                </div>
                {customOpen && (
                  <ClockPopup title="Custom dates" onClose={() => setCustomOpen(false)}>
                    <div className="grid grid-cols-2 gap-5">
                      <label className={LABEL}>First day<input type="date" value={from} min={now} onChange={(e) => { if (!e.target.value) return; setFrom(e.target.value); if (e.target.value > to) setTo(e.target.value); }} className={FIELD} /></label>
                      <label className={LABEL}>Last day<input type="date" value={to} min={from} onChange={(e) => e.target.value && setTo(e.target.value)} className={FIELD} /></label>
                    </div>
                    <p className="text-sm text-ink-muted">{to >= from ? `${span(from, to) + 1} day${span(from, to) === 0 ? "" : "s"} · ${longDay(from)}${from !== to ? ` → ${longDay(to)}` : ""}` : "The last day must be on or after the first day."}</p>
                  </ClockPopup>
                )}
                {newGoal && <GoalSheet onClose={() => setNewGoal(false)} onSaved={(g) => { setGoals((l) => [...l, g]); setGoalId(g.id); }} />}
                {repeat === "custom" && (
                  <div className="flex flex-wrap gap-2" role="group" aria-label="Days of the week">
                    {WEEKDAYS.map((w, i) => (
                      <button key={w} type="button" aria-pressed={picked[i]} onClick={() => setPicked((p) => p.map((v, j) => (j === i ? !v : v)))}
                        className={cn("h-10 w-12 rounded-full border text-sm transition-colors", picked[i] ? "border-ink bg-ink text-canvas" : "border-overlay/15 text-ink-muted")}>{w}</button>
                    ))}
                  </div>
                )}
                {repeat === "never" && <p className="text-xs text-ink-faint">Once, on the first day ({short(from)}).</p>}
                {repeat === "weekly" && <p className="text-xs text-ink-faint">Every {parse(from).toLocaleDateString(undefined, { weekday: "long" })}, the weekday of the first day.</p>}
                {repeat === "monthly" && <p className="text-xs text-ink-faint">On day {parse(from).getDate()} of each month, the date of the first day.</p>}
                {repeat.startsWith("every-") && <p className="text-xs text-ink-faint">{repeatLabel(repeat)}, counted from the first day: {days.slice(0, 4).map(short).join(", ")}{days.length > 4 ? " …" : ""}</p>}
              </Section>

              {/* 2. Tasks */}
              <Section n={2} title="Tasks">
                <TaskSheet rows={rows} setRows={setRows} clashes={clashes.keys} neet={neet} planRepeat={repeatLabel(repeat)} toolbar={contests}
                  goals={goals.map((g) => ({ id: g.id, title: g.title, period: periodLabel(g.period) }))} planGoal={goals.find((g) => g.id === goalId)?.title ?? "No goal"}
                  onImportPlan={(p) => {
                    const f = p.from ?? from;
                    if (p.from) setFrom(p.from);
                    if (p.to) setTo(p.to); else if (to < f) setTo(f);
                    if (p.repeat) setRepeat(p.repeat);
                    if (p.picked) setPicked(p.picked);
                  }} />
              </Section>

              {/* 3. Preview */}
              <div data-tour="preview">
              <Section n={3} title="Preview">
                <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
                  <p className="font-display text-3xl">{total} <span className="text-base text-ink-muted">task{total === 1 ? "" : "s"}</span></p>
                  <p className="text-sm text-ink-muted">
                    {repeating.length > 0 && <>{repeating.length} repeating task{repeating.length === 1 ? "" : "s"}{allDays.length > 0 && ` · ${longDay(allDays[0])}${allDays.length > 1 ? ` → ${longDay(allDays[allDays.length - 1])}` : ""}`}</>}
                    {repeating.length > 0 && dated.length > 0 && " · "}
                    {dated.length > 0 && `${dated.length} on their own date${dated.length === 1 ? "" : "s"}`}
                  </p>
                </div>
                {allDays.length > 0 && <MonthsPreview from={allDays[0] < from ? allDays[0] : from} to={allDays[allDays.length - 1] > to ? allDays[allDays.length - 1] : to} days={allDays} />}
              </Section>
              </div>

              {(problem || error) && <p className="text-sm text-accent-extreme" role="alert">{error ?? problem}</p>}
              <div className="sticky -bottom-6 -mx-6 -mb-6 flex justify-end gap-2 bg-gradient-to-t from-canvas-raised via-canvas-raised/90 to-transparent px-6 pb-6 pt-8 sm:-bottom-8 sm:-mx-8 sm:-mb-8 sm:px-8 sm:pb-8">
                <GlassButton type="button" onClick={onClose} disabled={busy} className="whitespace-nowrap max-sm:flex-1 max-sm:px-4">Cancel</GlassButton>
                <GlassButton type="button" data-tour="planner-add" onClick={() => void submit()} disabled={busy || !!problem} strong className="whitespace-nowrap max-sm:flex-1 max-sm:px-4">
                  {busy ? <ButtonWheel /> : <Check className="h-4 w-4" />}{busy ? "Adding…" : `Add ${total} task${total === 1 ? "" : "s"}`}
                </GlassButton>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

function Section({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-4">
      <h3 className="flex items-center gap-3 text-sm uppercase tracking-wide text-ink-muted">
        <span className="grid h-6 w-6 place-items-center rounded-full border border-overlay/20 text-xs text-ink">{n}</span>{title}
      </h3>
      {children}
    </section>
  );
}


/** Month calendars from the first to the last day, with the planned days filled in (up to 6 months shown). */
function MonthsPreview({ from, to, days }: { from: string; to: string; days: string[] }) {
  const set = new Set(days);
  const months: { y: number; m: number }[] = [];
  const f = parse(from);
  const t = parse(to);
  for (let y = f.getFullYear(), m = f.getMonth(); (y < t.getFullYear() || (y === t.getFullYear() && m <= t.getMonth())) && months.length < 6; m === 11 ? (y++, m = 0) : m++) months.push({ y, m });
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      {months.map(({ y, m }) => {
        const first = (new Date(y, m, 1).getDay() + 6) % 7;
        const count = new Date(y, m + 1, 0).getDate();
        return (
          <div key={`${y}-${m}`} className="rounded-3xl border border-overlay/10 bg-overlay/5 p-4">
            <p className="mb-3 text-sm text-ink">{new Date(y, m, 1).toLocaleDateString(undefined, { month: "long", year: "numeric" })}</p>
            <div className="grid grid-cols-7 gap-1 text-center text-xs">
              {WEEKDAYS.map((w) => <span key={w} className="pb-1 text-ink-faint">{w[0]}</span>)}
              {Array.from({ length: first }, (_, i) => <span key={`b${i}`} />)}
              {Array.from({ length: count }, (_, i) => {
                const day = `${y}-${pad(m + 1)}-${pad(i + 1)}`;
                const planned = set.has(day);
                const inRange = day >= from && day <= to;
                return (
                  <span key={day} className={cn("mx-auto grid h-7 w-7 place-items-center rounded-full tabular-nums", planned ? "bg-ink font-medium text-canvas" : inRange ? "text-ink-muted" : "text-ink-faint/50")}>{i + 1}</span>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** Shown only when some tasks were skipped: what was added and why the rest was not. */
function Result({ result, onClose }: { result: BulkResult; onClose: () => void }) {
  return (
    <div className="flex flex-col gap-5">
      <p className="font-display text-3xl">{result.created.length} added<span className="text-ink-muted"> · {result.skipped.length} skipped</span></p>
      <ul className="flex max-h-72 flex-col divide-y divide-overlay/10 overflow-y-auto rounded-3xl border border-overlay/10 bg-overlay/5 px-4">
        {result.skipped.map((s) => (
          <li key={s.index} className="py-3 text-sm">
            <span className="text-ink">{s.title}</span> <span className="text-ink-faint">· {longDay(s.startDay)}</span>
            <span className="block text-ink-muted">{s.reason}</span>
          </li>
        ))}
      </ul>
      <div className="flex justify-end"><GlassButton type="button" onClick={onClose} strong>Done</GlassButton></div>
    </div>
  );
}

/**
 * A chip that opens a menu, like a quick-add bar's: the planner's liquid glass button made compact (the same glass,
 * an icon and the value), opening the same menu the full-width dropdowns had.
 */
function ChipSelect({ icon: Icon, label, value, display, groups, onSelect, muted = false }: {
  icon: typeof Plus; label: string; value: string; display: string; groups: DropdownGroup[]; onSelect: (id: string) => void; muted?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  return (
    <>
      <button ref={trigger} type="button" onClick={() => setOpen((o) => !o)} aria-haspopup="listbox" aria-expanded={open} aria-label={`${label}: ${display}`} title={label}
        className="glass-fab relative inline-flex h-10 max-w-full items-center gap-2 rounded-full px-4 text-left text-sm text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-medium">
        <span className="glass-clear absolute inset-0" aria-hidden><LiquidGlass width="100%" height="100%" radius={20} blur={4} /></span>
        <Icon className={cn("relative h-4 w-4 shrink-0", muted ? "text-ink-faint" : "text-ink-muted")} strokeWidth={2} aria-hidden />
        <span className={cn("relative truncate", muted && "text-ink-muted")}>{display}</span>
        <ChevronDown className={cn("relative h-4 w-4 shrink-0 text-ink-muted transition-transform duration-200", open && "rotate-180")} aria-hidden />
      </button>
      {open && <DropdownMenu anchor={trigger} groups={groups} value={value} onSelect={onSelect} onClose={() => setOpen(false)} label={label} minWidth={260} />}
    </>
  );
}
