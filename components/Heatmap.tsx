"use client";
import { useLayoutEffect, useMemo, useRef, useState } from "react";
import type { HeatDay, Summary } from "@/lib/todo";
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
  const byDay = useMemo(() => new Map(days.map((d) => [d.day, d])), [days]);

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

  const c = summary.consistency;
  const n = (x: number) => `${x} ${x === 1 ? "day" : "days"}`;
  const slides = [
    { label: "Current streak", line1: `${n(c.currentStreak)} in a row.`, line2: c.currentStreak > 0 ? "Keep it going today." : "Log time or finish a task today to start a new streak." },
    { label: "Longest streak", line1: `Longest streak: ${n(c.longestStreak)}.`, line2: c.longestStreak > c.currentStreak ? "Can you beat it?" : "You are on your best run." },
    { label: "Active days", line1: `${c.activeDays} active ${c.activeDays === 1 ? "day" : "days"}.`, line2: "Every square below is a day you showed up." },
    { label: "Total time worked", line1: `${short(summary.totals.minutes)} of work.`, line2: "Across every task you have logged." },
  ];
  const current = slides[slide];
  const gridTemplateColumns = `repeat(${weeks.length}, ${CELL_PX}px)`;

  return (
    <section aria-label="Consistency">
      <div className="mb-4 flex items-baseline justify-between gap-3 px-1">
        <h3 className="font-display text-3xl leading-tight tracking-[-0.03em] text-ink sm:text-5xl">Consistency.</h3>
        <YearSelect year={year} years={years} onChange={setYear} className="text-sm sm:text-base" style={{ color: BRAND_BLUE }} />
      </div>
      <div className="pw-card rounded-[32px] border border-overlay/10 bg-canvas-raised px-4 pb-8 pt-8 sm:px-10 sm:pt-12">
        <div key={slide} className="glass-in mx-auto max-w-xl text-center" aria-live="polite">
          <p className="font-display text-2xl leading-[1.15] tracking-[-0.03em] text-ink sm:text-4xl">{current.line1}</p>
          <p className="mt-1 font-display text-2xl leading-[1.15] tracking-[-0.03em] text-ink-muted sm:text-4xl">{current.line2}</p>
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
