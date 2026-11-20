"use client";
import { duration, longDay } from "@/lib/days";
import type { HeatDay } from "@/lib/todo";
import { cn } from "@/lib/utils";

const LEVEL_BG = ["bg-overlay/10", "bg-accent-medium/25", "bg-accent-medium/50", "bg-accent-medium/75", "bg-accent-medium"];

/** GitHub-style grid: one column per week (Monday on top), darker green = more time worked. */
export function Heatmap({ days, onOpenDay }: { days: HeatDay[]; onOpenDay: (day: string) => void }) {
  if (days.length === 0) return null;
  const [y, m, d] = days[0].day.split("-").map(Number);
  const lead = (new Date(y, m - 1, d).getDay() + 6) % 7; // empty cells before the first day so rows line up with weekdays
  const cells: (HeatDay | null)[] = [...Array<null>(lead).fill(null), ...days];
  const weeks: (HeatDay | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));

  return (
    <div>
      <div className="flex gap-[3px] overflow-x-auto pb-1">
        {weeks.map((week, wi) => (
          <div key={wi} className="flex flex-col gap-[3px]">
            {week.map((c, di) =>
              c ? (
                <button
                  key={c.day}
                  onClick={() => onOpenDay(c.day)}
                  title={`${longDay(c.day)}: ${duration(c.minutes)}, ${c.completed} finished, ${c.created} added`}
                  aria-label={`${longDay(c.day)}: ${duration(c.minutes)}`}
                  className={cn("h-3 w-3 shrink-0 transition-transform hover:scale-125", LEVEL_BG[c.level])}
                />
              ) : (
                <span key={`e${di}`} className="h-3 w-3" />
              )
            )}
          </div>
        ))}
      </div>
      <div className="mt-3 flex items-center gap-1.5 text-xs text-ink-faint">
        Less {LEVEL_BG.map((bg) => <span key={bg} className={cn("h-3 w-3", bg)} />)} More
      </div>
    </div>
  );
}
