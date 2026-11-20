"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CalendarRange, Check, X } from "lucide-react";
import LiquidGlass from "@/components/LiquidGlass";
import { GlassButton } from "@/components/GlassButton";
import { TaskSheet, blankRow, findClashes, type SheetRow } from "@/components/TaskSheet";
import { FIELD, LABEL } from "@/components/ui";
import { addDays, longDay, today } from "@/lib/days";
import { titleProblem } from "@/lib/rules";
import { createBulk, type BulkResult, type Task } from "@/lib/todo";
import { cn } from "@/lib/utils";
import { GlassDropdown } from "@/components/GlassDropdown";
import { INTERVALS, MAX_RANGE_DAYS, PATTERNS, planDays, repeatLabel, span, weekday, type Repeat } from "@/lib/repeat";
import { ButtonWheel } from "@/components/WheelSpinner";
import { ClockPopup } from "@/components/TaskDialogs";

/**
 * The task planner: several tasks over many days in one go — a week of workouts, a month of revision,
 * weekdays only, once a week, once a month. Every task becomes its own one-day task (so each day can be
 * ticked off on its own) and is added with one request; the server checks each one with the normal rules.
 */
const MAX_TASKS = 200;
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
  ];
}

export function TaskPlanner({ onClose, onCreated, neet = false }: { onClose: () => void; onCreated: (tasks: Task[]) => void; neet?: boolean }) {
  const now = today();
  const quick = useMemo(() => presets(now), [now]);
  const [from, setFrom] = useState(now);
  const [to, setTo] = useState(addDays(now, 6));
  const [repeat, setRepeat] = useState<Repeat>("daily");
  const [picked, setPicked] = useState<boolean[]>([true, false, true, false, true, false, false]);
  const [rows, setRows] = useState<SheetRow[]>(() => [blankRow(), blankRow(), blankRow()]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<BulkResult | null>(null);
  const firstDayRef = useRef<HTMLInputElement>(null);
  /** "Custom dates" in the Range menu opens its own small popup with the first and last day. */
  const [customOpen, setCustomOpen] = useState(false);
  const preset = quick.find((p) => p.from === from && p.to === to);

  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
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
  const rangeProblem = from < now ? "The first day cannot be in the past." : to < from ? "The last day must be on or after the first day." : span(from, to) > MAX_RANGE_DAYS ? `Plan at most ${MAX_RANGE_DAYS + 1} days at a time.` : null;
  const problem =
    rangeProblem ??
    (filled.length === 0 ? "Give at least one task a title." : null) ??
    filled.map((r) => titleProblem(r.title)).find(Boolean) ??
    filled.map((r) => (!r.allDay && r.endTime <= r.startTime ? `“${r.title.trim()}”: the end time must be after the start time.` : null)).find(Boolean) ??
    dated.filter((r) => r.day < now).map((r) => `“${r.title.trim()}”: its date is in the past.`)[0] ??
    repeating.filter((r) => daysFor(r).length === 0).map((r) => `“${r.title.trim()}”: no day in this range matches its repeat.`)[0] ??
    clashes.message ??
    (total > MAX_TASKS ? `That is ${total} tasks; one plan can add at most ${MAX_TASKS}. Shorten the range or repeat less often.` : null);


  async function submit() {
    if (problem || busy) return;
    setBusy(true);
    setError(null);
    try {
      const task = (r: SheetRow, day: string) => ({ title: r.title.trim(), notes: r.notes.trim(), priority: r.priority, startDay: day, dueDay: day, startTime: r.allDay ? null : r.startTime, endTime: r.allDay ? null : r.endTime });
      const tasks = [...repeating.flatMap((r) => daysFor(r).map((day) => task(r, day))), ...dated.map((r) => task(r, r.day))].sort((x, y) => x.startDay.localeCompare(y.startDay));
      const res = await createBulk(tasks);
      if (res.created.length) onCreated(res.created);
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
                <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                  <div>
                    <p className={cn(LABEL, "mb-2")}>Range</p>
                    <GlassDropdown label="Range" value={preset?.label ?? "custom"} display={preset ? `${preset.label} · ${short(from)} – ${short(to)}` : `Custom · ${short(from)} – ${short(to)}`}
                      groups={[
                        { title: "Quick ranges", items: quick.map((p) => ({ id: p.label, label: p.label, meta: `${short(p.from)} – ${short(p.to)}` })) },
                        { title: "Your own", items: [{ id: "custom", label: "Custom dates", meta: preset ? "pick days" : `${short(from)} – ${short(to)}` }] },
                      ]}
                      onSelect={(id) => { const p = quick.find((q) => q.label === id); if (p) { setFrom(p.from); setTo(p.to); } else setCustomOpen(true); }} />
                    {customOpen && (
                      <ClockPopup title="Custom dates" onClose={() => setCustomOpen(false)}>
                        <div className="grid grid-cols-2 gap-5">
                          <label className={LABEL}>First day<input type="date" value={from} min={now} onChange={(e) => { if (!e.target.value) return; setFrom(e.target.value); if (e.target.value > to) setTo(e.target.value); }} className={FIELD} /></label>
                          <label className={LABEL}>Last day<input type="date" value={to} min={from} onChange={(e) => e.target.value && setTo(e.target.value)} className={FIELD} /></label>
                        </div>
                        <p className="text-sm text-ink-muted">{to >= from ? `${span(from, to) + 1} day${span(from, to) === 0 ? "" : "s"} · ${longDay(from)}${from !== to ? ` → ${longDay(to)}` : ""}` : "The last day must be on or after the first day."}</p>
                      </ClockPopup>
                    )}
                  </div>
                  <div>
                    <p className={cn(LABEL, "mb-2")}>Repeat</p>
                    <GlassDropdown label="Repeat" value={repeat} display={repeatLabel(repeat)}
                      groups={[{ title: "Pattern", items: PATTERNS }, { title: "Interval", items: INTERVALS.map((x) => ({ ...x, meta: `${planDays(from, to, x.id, picked).length} days` })) }]}
                      onSelect={(id) => setRepeat(id as Repeat)} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-5">
                  <label className={LABEL}>First day<input ref={firstDayRef} type="date" value={from} min={now} onChange={(e) => { if (!e.target.value) return; setFrom(e.target.value); if (e.target.value > to) setTo(e.target.value); }} className={FIELD} /></label>
                  <label className={LABEL}>Last day<input type="date" value={to} min={from} onChange={(e) => e.target.value && setTo(e.target.value)} className={FIELD} /></label>
                </div>
                {repeat === "custom" && (
                  <div className="flex flex-wrap gap-2" role="group" aria-label="Days of the week">
                    {WEEKDAYS.map((w, i) => (
                      <button key={w} type="button" aria-pressed={picked[i]} onClick={() => setPicked((p) => p.map((v, j) => (j === i ? !v : v)))}
                        className={cn("h-10 w-12 rounded-full border text-sm transition-colors", picked[i] ? "border-ink bg-ink text-canvas" : "border-overlay/15 text-ink-muted")}>{w}</button>
                    ))}
                  </div>
                )}
                {repeat === "weekly" && <p className="text-xs text-ink-faint">Every {parse(from).toLocaleDateString(undefined, { weekday: "long" })}, the weekday of the first day.</p>}
                {repeat === "monthly" && <p className="text-xs text-ink-faint">On day {parse(from).getDate()} of each month, the date of the first day.</p>}
                {repeat.startsWith("every-") && <p className="text-xs text-ink-faint">{repeatLabel(repeat)}, counted from the first day: {days.slice(0, 4).map(short).join(", ")}{days.length > 4 ? " …" : ""}</p>}
              </Section>

              {/* 2. Tasks */}
              <Section n={2} title="Tasks">
                <TaskSheet rows={rows} setRows={setRows} clashes={clashes.keys} neet={neet} />
              </Section>

              {/* 3. Preview */}
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

              {(problem || error) && <p className="text-sm text-accent-extreme" role="alert">{error ?? problem}</p>}
              <div className="sticky -bottom-6 -mx-6 -mb-6 flex justify-end gap-2 bg-gradient-to-t from-canvas-raised via-canvas-raised/90 to-transparent px-6 pb-6 pt-8 sm:-bottom-8 sm:-mx-8 sm:-mb-8 sm:px-8 sm:pb-8">
                <GlassButton type="button" onClick={onClose} disabled={busy}>Cancel</GlassButton>
                <GlassButton type="button" onClick={() => void submit()} disabled={busy || !!problem} strong>
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
