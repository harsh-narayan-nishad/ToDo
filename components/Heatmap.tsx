"use client";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown } from "lucide-react";
import { todoApi, type HeatDay, type Summary, type Task, type WorkLog } from "@/lib/todo";
import { cn } from "@/lib/utils";
import { YearSelect, yearOptions } from "@/components/GlassDropdown";

/**
 * The consistency graph, matched to Pacewise's (Pacewise/components/Analytics/ContributionHeatmap.tsx): one
 * calendar year (picked in the year dropdown) built month by month (each month starts in a new column, day 1 on its real weekday), month labels on
 * top, four levels of green, dashed future days, a ring on today, an instant hover card, and a line above the grid
 * you page through with the dots underneath (current streak, longest streak, active days, total time).
 * Clicking a day opens it in History.
 */
type Level = 0 | 1 | 2 | 3;
const LEVEL_CLASS: Record<Level, string> = { 0: "bg-overlay/10", 1: "bg-accent-medium/30", 2: "bg-accent-medium/60", 3: "bg-accent-medium" };
const LEVEL_LABEL: Record<Level, string> = { 0: "No activity", 1: "Low", 2: "Medium", 3: "High" };
const BRAND_BLUE = "#306fdb";
const HOVER_CARD_CLASS = "rounded-2xl border border-overlay/10 bg-canvas-raised px-3.5 py-2.5 text-[13px] leading-snug text-ink shadow-themed";
const CELL_PX = 11;
const GAP_PX = 3;

/** Time worked plus finished tasks (one counts like 20 minutes), in four levels, as Pacewise weighs a finished story. */
function levelFor(d: HeatDay | null): Level {
  if (!d) return 0;
  const score = d.minutes + d.completed * 20;
  if (score <= 0) return 0;
  if (score < 15) return 1;
  if (score < 40) return 2;
  return 3;
}
/** "1h 05m", "45m", "0m". */
const short = (m: number) => (m >= 60 ? `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m` : `${m}m`);
const pad = (n: number) => String(n).padStart(2, "0");
const keyOf = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

interface DayCell { date: Date; key: string; entry: HeatDay | null; isFuture: boolean; isToday: boolean }
type GridCell = DayCell | null;

function tooltipLines(day: DayCell): string[] {
  const label = day.date.toLocaleDateString("en-US", { day: "numeric", month: "long", year: "numeric" });
  const e = day.entry;
  if (!e || (e.minutes === 0 && e.completed === 0 && e.created === 0)) return [label, "No activity"];
  return [
    label,
    `${e.completed > 0 ? "✅" : "—"} ${e.completed} ${e.completed === 1 ? "Task" : "Tasks"} finished`,
    `Total time worked: ${short(e.minutes)}`,
    `Tasks added: ${e.created}`,
  ];
}

function PagerPill({ count, index, onSelect, labels }: { count: number; index: number; onSelect: (i: number) => void; labels: string[] }) {
  return (
    <div className="mt-5 flex items-center justify-center">
      <div role="tablist" aria-label="Slides" className="flex h-12 items-center gap-3 rounded-full bg-overlay/[0.08] px-6 backdrop-blur-sm">
        {Array.from({ length: count }, (_, i) => (
          <button key={i} role="tab" type="button" aria-selected={i === index} aria-label={labels[i] ?? `Slide ${i + 1}`} onClick={() => onSelect(i)} className="grid h-6 place-items-center">
            <span className={cn("block h-1.5 rounded-full transition-all duration-300", i === index ? "w-8 bg-ink-muted" : "w-1.5 bg-ink-faint")} />
          </button>
        ))}
      </div>
    </div>
  );
}

export function Heatmap({ days, summary, onOpenDay }: { days: HeatDay[]; summary: Summary; onOpenDay: (day: string) => void }) {
  /** Opens scrolled to the end, so the current month and today are in view (older months are a scroll to the left). */
  const scroller = useRef<HTMLDivElement>(null);
  const [year, setYear] = useState(() => new Date().getFullYear());
  /** This year back to the earliest year the server sends (at least two years back). */
  const years = useMemo(() => yearOptions(days.length ? Number(days[0].day.slice(0, 4)) : undefined), [days]);
  // This year opens on today; an earlier year opens at its start.
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    if (year !== new Date().getFullYear()) { el.scrollLeft = 0; return; }
    const t = el.querySelector<HTMLElement>("[data-today]");
    el.scrollLeft = t ? Math.max(0, el.scrollLeft + t.getBoundingClientRect().left - el.getBoundingClientRect().left - el.clientWidth + 48) : el.scrollWidth;
  }, [days.length, year]);
  const [slide, setSlide] = useState(0);
  const [hovered, setHovered] = useState<{ day: DayCell; x: number; y: number } | null>(null);
  /** Tasks picked in the left dropdown (by title, so a repeating task counts as one); none = every task. */
  const [picked, setPicked] = useState<string[]>([]);
  const [source, setSource] = useState<{ tasks: Task[]; logs: WorkLog[] } | null>(null);
  const loadSource = () => {
    if (source) return;
    Promise.all([todoApi.tasks(), todoApi.logs()]).then(([tasks, logs]) => setSource({ tasks, logs }), () => setSource({ tasks: [], logs: [] }));
  };
  // Reload the tasks and logs whenever the profile reloads (days change) while a filter is on.
  useEffect(() => { setSource(null); }, [days]);
  useEffect(() => { if (picked.length && !source) loadSource(); }, [picked.length, source]); // eslint-disable-line react-hooks/exhaustive-deps
  const taskOptions = useMemo(() => taskTitles(source?.tasks ?? []), [source]);
  const filtered = useMemo(() => (picked.length && source ? filterDays(source.tasks, source.logs, picked) : null), [picked, source]);
  const shownDays = picked.length ? (filtered ?? []) : days;
  const byDay = useMemo(() => new Map(shownDays.map((d) => [d.day, d])), [shownDays]);

  const weeks = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const cols: GridCell[][] = [];
    for (let m = 0; m < 12; m++) {
      const monthStart = new Date(year, m, 1);
      const month = m;
      const daysInMonth = new Date(year, month + 1, 0).getDate();
      const flat: GridCell[] = Array<null>(monthStart.getDay()).fill(null); // weekday of the 1st (0 = Sunday)
      for (let d = 1; d <= daysInMonth; d++) {
        const date = new Date(year, month, d);
        const key = keyOf(date);
        flat.push({ date, key, entry: byDay.get(key) ?? null, isFuture: date > today, isToday: date.getTime() === today.getTime() });
      }
      const trailing = (7 - (flat.length % 7)) % 7;
      for (let i = 0; i < trailing; i++) flat.push(null);
      for (let i = 0; i < flat.length; i += 7) cols.push(flat.slice(i, i + 7));
    }
    return cols;
  }, [byDay, year]);

  const monthLabels = useMemo(() => weeks.map((col) => {
    const first = col.find((c) => c && c.date.getDate() === 1) as DayCell | undefined;
    return first ? first.date.toLocaleDateString("en-US", { month: "short" }) : null;
  }), [weeks]);

  const c = filtered ? streaksOf(filtered) : summary.consistency;
  const totalMinutes = filtered ? filtered.reduce((a, d) => a + d.minutes, 0) : summary.totals.minutes;
  const n = (x: number) => `${x} ${x === 1 ? "day" : "days"}`;
  const slides = [
    { label: "Current streak", line1: `${n(c.currentStreak)} in a row.`, line2: c.currentStreak > 0 ? "Keep it going today." : "Log time or finish a task today to start a new streak." },
    { label: "Longest streak", line1: `Longest streak: ${n(c.longestStreak)}.`, line2: c.longestStreak > c.currentStreak ? "Can you beat it?" : "You are on your best run." },
    { label: "Active days", line1: `${c.activeDays} active ${c.activeDays === 1 ? "day" : "days"}.`, line2: "Every square below is a day you showed up." },
    { label: "Total time worked", line1: `${short(totalMinutes)} of work.`, line2: picked.length ? `Across ${picked.length === 1 ? "this task" : `these ${picked.length} tasks`}.` : "Across every task you have logged." },
  ];
  const current = slides[slide];
  const gridTemplateColumns = `repeat(${weeks.length}, ${CELL_PX}px)`;

  return (
    <section aria-label="Consistency">
      {/* The title on its own line, then the two filters on one row underneath: tasks on the left, year on the right, same size and line. */}
      <div className="mb-4 flex flex-col gap-2 px-1 sm:gap-3">
        <h3 className="font-display text-3xl leading-tight tracking-[-0.03em] text-ink sm:text-5xl">Consistency.</h3>
        <div className="flex items-start justify-between gap-6">
          <TaskSelect options={taskOptions} picked={picked} onChange={setPicked} onOpen={loadSource} loading={!source} className="text-[15px] font-medium leading-6 sm:text-base" style={{ color: BRAND_BLUE }} />
          <YearSelect year={year} years={years} onChange={setYear} className="text-[15px] font-medium leading-6 sm:text-base" style={{ color: BRAND_BLUE }} />
        </div>
      </div>
      <div className="pw-card rounded-[32px] border border-overlay/10 bg-canvas-raised px-4 pb-8 pt-8 sm:px-10 sm:pt-12">
        <div key={slide} className="glass-in mx-auto max-w-xl text-center" aria-live="polite">
          {/* A headline and a quieter line under it (Apple's title / subtitle pair): sizes step up with the screen, lines wrap evenly. */}
          <p className="text-balance font-display text-[26px] font-medium leading-[1.12] tracking-[-0.025em] text-ink sm:text-4xl lg:text-[40px]">{current.line1}</p>
          <p className="mx-auto mt-2 max-w-md text-balance font-display text-[17px] leading-snug tracking-[-0.01em] text-ink-muted sm:text-xl">{current.line2}</p>
        </div>

        <div className="mt-8 flex justify-center">
          <div className="max-w-full">
            <div ref={scroller} className="overflow-x-auto pb-2">
              <div className="inline-flex flex-col gap-2">
                <div className="grid" style={{ gridTemplateColumns, columnGap: GAP_PX }}>
                  {monthLabels.map((label, wi) => (
                    <div key={wi} className="relative h-4 overflow-visible whitespace-nowrap text-xs text-ink-muted">
                      {label && <span className="absolute left-0">{label}</span>}
                    </div>
                  ))}
                </div>
                <div className="grid" style={{ gridTemplateColumns, columnGap: GAP_PX }}>
                  {weeks.map((col, wi) => (
                    <div key={wi} className="grid" style={{ gridTemplateRows: `repeat(7, ${CELL_PX}px)`, rowGap: GAP_PX }}>
                      {col.map((cell, ci) => {
                        if (!cell) return <div key={`blank-${wi}-${ci}`} style={{ width: CELL_PX, height: CELL_PX }} />;
                        if (cell.isFuture) return <div key={cell.key} aria-hidden className="rounded-[2px] border border-dashed border-overlay/10" style={{ width: CELL_PX, height: CELL_PX }} />;
                        const level = levelFor(cell.entry);
                        const show = (el: HTMLElement) => { const r = el.getBoundingClientRect(); setHovered({ day: cell, x: r.left + r.width / 2, y: r.top }); };
                        return (
                          <button key={cell.key} type="button" data-today={cell.isToday || undefined} aria-label={tooltipLines(cell).join(", ")} style={{ width: CELL_PX, height: CELL_PX }}
                            onClick={() => onOpenDay(cell.key)}
                            onMouseEnter={(e) => show(e.currentTarget)} onMouseLeave={() => setHovered(null)}
                            onFocus={(e) => show(e.currentTarget)} onBlur={() => setHovered(null)}
                            className={cn("rounded-[2px] transition-transform duration-150 hover:scale-125 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-medium", LEVEL_CLASS[level],
                              cell.isToday && "ring-2 ring-ink/70 ring-offset-1 ring-offset-canvas")} />
                        );
                      })}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
        <div className="mt-5 flex items-center justify-center gap-1.5 text-xs text-ink-muted">
          <span>No activity</span>
          {([0, 1, 2, 3] as Level[]).map((l) => <span key={l} className={cn("h-[11px] w-[11px] rounded-[2px]", LEVEL_CLASS[l])} title={LEVEL_LABEL[l]} />)}
          <span>High</span>
        </div>
      </div>
      <PagerPill count={slides.length} index={slide} onSelect={setSlide} labels={slides.map((x) => x.label)} />

      {hovered && (
        <div role="tooltip" className={cn("pointer-events-none fixed z-50 -translate-x-1/2 -translate-y-full whitespace-pre-line", HOVER_CARD_CLASS)} style={{ left: hovered.x, top: hovered.y - 8 }}>
          {tooltipLines(hovered.day).map((line, i) => <div key={i} className={i === 0 ? "mb-1 font-display text-base tracking-[-0.02em] text-ink" : "text-ink-muted"}>{line}</div>)}
        </div>
      )}
    </section>
  );
}

/** A title without a trailing number ("LeetCode Weekly Contest 591" → "LeetCode Weekly Contest"), so numbered copies of one task are one task. */
const baseTitle = (t: string) => t.trim().replace(/[\s#:–—-]*\d+$/, "").trim() || t.trim();
/** A task's key: its base title in lower case, so every copy of a repeating or numbered task counts as one. */
const titleKey = (t: string) => baseTitle(t).toLowerCase();

/** One option per task title (newest first), with how many times it was added. */
function taskTitles(tasks: Task[]): { key: string; title: string; count: number }[] {
  const map = new Map<string, { key: string; title: string; count: number; at: string }>();
  for (const t of tasks) {
    const key = titleKey(t.title);
    const o = map.get(key);
    if (o) { o.count++; if (t.createdAt > o.at) o.at = t.createdAt; } else map.set(key, { key, title: baseTitle(t.title), count: 1, at: t.createdAt });
  }
  return [...map.values()].sort((a, b) => b.at.localeCompare(a.at)).map(({ key, title, count }) => ({ key, title, count }));
}

/** The heatmap days of only the picked tasks: their logged time, the days they were added and the days they were finished. */
function filterDays(tasks: Task[], logs: WorkLog[], picked: string[]): HeatDay[] {
  const keys = new Set(picked);
  const ids = new Set<string>();
  const out = new Map<string, HeatDay>();
  const at = (day: string) => { let d = out.get(day); if (!d) { d = { day, minutes: 0, created: 0, completed: 0, level: 0 }; out.set(day, d); } return d; };
  for (const t of tasks) {
    if (!keys.has(titleKey(t.title))) continue;
    ids.add(t.id);
    at(t.createdDay).created++;
    if (t.status === "done" && t.completedDay) at(t.completedDay).completed++;
  }
  for (const l of logs) {
    if (ids.has(l.taskId) || keys.has(titleKey(l.taskTitle))) at(l.day).minutes += l.minutes;
  }
  return [...out.values()].sort((a, b) => a.day.localeCompare(b.day));
}

/** Current streak, longest streak and active days of the filtered days (a day counts when time was logged or a task finished). */
function streaksOf(list: HeatDay[]): { currentStreak: number; longestStreak: number; activeDays: number } {
  const active = new Set(list.filter((d) => d.minutes > 0 || d.completed > 0).map((d) => d.day));
  const step = (k: string, by: number) => { const d = new Date(k + "T12:00"); d.setDate(d.getDate() + by); return keyOf(d); };
  let longest = 0;
  for (const k of active) {
    if (active.has(step(k, -1))) continue; // not the start of a run
    let len = 1;
    for (let x = step(k, 1); active.has(x); x = step(x, 1)) len++;
    longest = Math.max(longest, len);
  }
  // Today not active yet: the streak still counts up to yesterday.
  let cur = 0;
  let k = keyOf(new Date());
  if (!active.has(k)) k = step(k, -1);
  for (; active.has(k); k = step(k, -1)) cur++;
  return { currentStreak: cur, longestStreak: longest, activeDays: active.size };
}

/**
 * The task picker on the left of the heading: quiet text with a ⌄, like the year. Tap a task's name to see only
 * that task; tick the boxes to see several together; "All tasks" goes back to everything.
 */
function TaskSelect({ options, picked, onChange, onOpen, loading, className, style }: {
  options: { key: string; title: string; count: number }[]; picked: string[]; onChange: (keys: string[]) => void; onOpen: () => void; loading: boolean;
  className?: string; style?: React.CSSProperties;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top?: number; bottom?: number; maxHeight: number } | null>(null);
  const width = 300;

  const place = () => {
    const r = trigger.current?.getBoundingClientRect();
    if (!r) return;
    const left = Math.max(12, Math.min(r.left, window.innerWidth - Math.min(width, window.innerWidth - 24) - 12));
    const below = window.innerHeight - r.bottom - 16;
    const above = r.top - 16;
    if (below < 260 && above > below) setPos({ left, bottom: window.innerHeight - r.top + 6, maxHeight: Math.min(360, above) });
    else setPos({ left, top: r.bottom + 6, maxHeight: Math.max(180, Math.min(360, below)) });
  };
  useLayoutEffect(() => { if (open) place(); else setPos(null); }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => { if (!menu.current?.contains(e.target as Node) && !trigger.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopImmediatePropagation(); setOpen(false); trigger.current?.focus(); } };
    document.addEventListener("pointerdown", onDown, true);
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      document.removeEventListener("pointerdown", onDown, true);
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }); // eslint-disable-line react-hooks/exhaustive-deps

  const names = new Map(options.map((o) => [o.key, o.title]));
  const display = picked.length === 0 ? "All tasks" : picked.length === 1 ? (names.get(picked[0]) ?? "1 task") : `${picked.length} tasks`;
  const q = query.trim().toLowerCase();
  const shown = q ? options.filter((o) => o.key.includes(q)) : options;
  const toggle = (key: string) => onChange(picked.includes(key) ? picked.filter((k) => k !== key) : [...picked, key]);
  const row = "flex min-w-0 flex-1 items-center gap-2.5 px-4 py-[11px] text-left text-[16px] text-ink outline-none transition-colors active:bg-overlay/[0.08] focus-visible:bg-overlay/[0.07]";

  return (
    <>
      <button ref={trigger} type="button" onClick={() => { if (!open) onOpen(); setOpen((o) => !o); }} aria-haspopup="listbox" aria-expanded={open} aria-label={`Tasks: ${display}`}
        title={display} className={cn("inline-flex min-w-0 max-w-[13.5rem] items-center gap-1 text-left outline-none sm:max-w-[18rem] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-medium", className)} style={style}>
        {/* a set width: a longer name ends in "…" (the full name shows on hover and in the menu) */}
        <span className="min-w-0 truncate">{display}</span>
        <ChevronDown className={cn("h-4 w-4 shrink-0 transition-transform duration-200", open && "rotate-180")} strokeWidth={2} aria-hidden />
      </button>
      {open && pos && createPortal(
        <div ref={menu} role="listbox" aria-label="Tasks" aria-multiselectable className="pw-menu glass-in fixed z-[160] flex max-w-[calc(100vw-24px)] flex-col overflow-hidden rounded-[14px]"
          style={{ top: pos.top, bottom: pos.bottom, left: pos.left, width: Math.min(width, window.innerWidth - 24), maxHeight: pos.maxHeight }}>
          {options.length > 8 && (
            <div className="border-b border-overlay/10 px-3 py-2">
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search tasks" aria-label="Search tasks"
                className="w-full rounded-lg bg-overlay/[0.06] px-3 py-1.5 text-[15px] text-ink outline-none placeholder:text-ink-faint" />
            </div>
          )}
          <div className="min-w-0 overflow-y-auto overflow-x-hidden overscroll-contain" style={{ touchAction: "pan-y" }}>
            <button type="button" role="option" aria-selected={picked.length === 0} onClick={() => { onChange([]); setOpen(false); }} className={cn(row, "w-full border-b border-overlay/10")}>
              <Check className={cn("h-4 w-4 shrink-0", picked.length === 0 ? "opacity-100" : "opacity-0")} strokeWidth={2.5} aria-hidden />
              <span className="flex-1 truncate">All tasks</span>
            </button>
            {loading && <p className="px-4 py-3 text-sm text-ink-faint">Loading tasks…</p>}
            {!loading && shown.length === 0 && <p className="px-4 py-3 text-sm text-ink-faint">{options.length ? "No task matches." : "No tasks yet."}</p>}
            {shown.map((o, i) => {
              const on = picked.includes(o.key);
              return (
                <div key={o.key} className={cn("flex w-full min-w-0 items-center", i < shown.length - 1 && "border-b border-overlay/10")}>
                  {/* the box adds or removes this task (several together) */}
                  <button type="button" role="checkbox" aria-checked={on} aria-label={`${on ? "Remove" : "Add"} ${o.title}`} onClick={() => toggle(o.key)}
                    className="grid h-11 w-11 shrink-0 place-items-center pl-2 outline-none focus-visible:bg-overlay/[0.07]">
                    <span className={cn("flex h-[18px] w-[18px] items-center justify-center rounded-[5px] border transition-colors", on ? "border-ink bg-ink text-canvas" : "border-overlay/30")}>
                      {on && <Check className="h-3 w-3" strokeWidth={3} />}
                    </span>
                  </button>
                  {/* the name shows only this task */}
                  <button type="button" role="option" aria-selected={on} onClick={() => { onChange([o.key]); setOpen(false); }} className={cn(row, "pl-1")}>
                    <span className={cn("min-w-0 flex-1", on ? "whitespace-normal break-words" : "truncate")}>{o.title}</span>
                    {/* how many times this task was added, in a circle */}
                    <span title={`Added ${o.count} ${o.count === 1 ? "time" : "times"}`} aria-label={`${o.count} ${o.count === 1 ? "time" : "times"}`}
                      className="grid h-6 min-w-6 shrink-0 place-items-center rounded-full bg-overlay/10 px-1.5 text-xs tabular-nums text-ink-muted">{o.count}</span>
                  </button>
                </div>
              );
            })}
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
