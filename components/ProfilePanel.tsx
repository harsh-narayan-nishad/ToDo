"use client";
import { useEffect, useState } from "react";
import { PanelLoader } from "@/components/WheelSpinner";
import { Flame } from "lucide-react";
import { Card, Stat } from "@/components/ui";
import { Heatmap } from "@/components/Heatmap";
import type { User } from "@/lib/api";
import { dayLabel, duration, longDay } from "@/lib/days";
import { todoApi, type HeatDay, type Summary } from "@/lib/todo";
import { cn } from "@/lib/utils";

/** Totals and hours worked, all from the server. */
export function ProfilePanel({ user, version, onOpenDay }: { user: User; version: number; onOpenDay: (day: string) => void }) {
  const [data, setData] = useState<Summary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    todoApi.summary().then((s) => { setData(s); setError(null); }, (e) => setError(e instanceof Error ? e.message : "Could not load your profile."));
  }, [version]);

  if (error) return <p className="text-sm text-accent-extreme" role="alert">{error}</p>;
  if (!data) return <PanelLoader label="Loading your profile" />;
  const { totals: t } = data;

  return (
    <div className="flex flex-col gap-8">
      <Card className="ios-card flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          {user.avatarUrl ? <img src={user.avatarUrl} alt="" className="h-14 w-14 object-cover" /> : (
            <span className="flex h-14 w-14 items-center justify-center bg-overlay/10 font-display text-2xl">{user.name.slice(0, 1).toUpperCase()}</span>
          )}
          <div>
            <p className="text-xl text-ink">{user.name}</p>
            <p className="text-sm text-ink-muted">@{user.username}</p>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat className="ios-card" label="Tasks created" value={t.created} />
        <Stat className="ios-card" label="Tasks finished" value={t.completed} tone="green" hint={t.created ? `${Math.round((t.completed / t.created) * 100)}% of created` : undefined} />
        <Stat className="ios-card" label="Open" value={t.open} hint={t.overdue ? `${t.overdue} overdue` : "none overdue"} tone={t.overdue ? "red" : undefined} />
        <Stat className="ios-card" label="Hours worked" value={`${t.hours} h`} tone="blue" hint={t.workedDays ? `about ${duration(t.avgMinutesPerWorkedDay)} per working day` : "log time on a task"} />
      </div>

      <WeekChart days={data.heatmap.slice(-7)} onOpenDay={onOpenDay} />

      <Heatmap days={data.heatmap} summary={data} onOpenDay={onOpenDay} />
    </div>
  );
}

/** "9h 11m", "45m", "0m" (the compact form Screen Time uses). */
const hm = (m: number) => (m >= 60 ? `${Math.floor(m / 60)}h${m % 60 ? ` ${m % 60}m` : ""}` : `${m}m`);
const WEEKDAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/**
 * The last 7 days as a Screen Time-style chart: the week's total on top, bars of time worked per day against
 * gridlines with their values on the right, a dashed line between days, and a legend underneath. Click a day to open it.
 */
function WeekChart({ days, onOpenDay }: { days: HeatDay[]; onOpenDay: (day: string) => void }) {
  const total = days.reduce((a, d) => a + d.minutes, 0);
  const finished = days.reduce((a, d) => a + d.completed, 0);
  const added = days.reduce((a, d) => a + d.created, 0);
  const best = days.reduce<HeatDay | null>((b, d) => (d.minutes > (b?.minutes ?? 0) ? d : b), null);
  // A round top for the scale: the busiest day, up to the next half hour (at least an hour).
  const top = Math.max(60, Math.ceil(Math.max(...days.map((d) => d.minutes), 0) / 30) * 30);
  const label = (d: HeatDay) => { const l = dayLabel(d.day); return l === "Today" ? "Today" : WEEKDAY[new Date(d.day + "T12:00").getDay()]; };

  return (
    <Card className="ios-card">
      <div className="mb-1 flex items-center gap-2"><Flame className="h-4 w-4 text-accent-fast" /><h2 className="text-sm uppercase tracking-wide text-ink-muted">Last 7 days</h2></div>
      <p className="mb-5 font-display text-3xl text-ink">{hm(total)}</p>

      <div className="flex gap-3">
        <div className="relative h-40 flex-1">
          {/* gridlines: top, middle, zero */}
          {[0, 0.5, 1].map((f) => <span key={f} className={cn("pointer-events-none absolute inset-x-0 border-t", f === 1 ? "border-overlay/25" : "border-overlay/10")} style={{ top: `${f * 100}%` }} aria-hidden />)}
          <div className="absolute inset-0 flex">
            {days.map((d, i) => (
              <button key={d.day} type="button" onClick={() => onOpenDay(d.day)} title={`${longDay(d.day)}: ${duration(d.minutes)} worked, ${d.completed} finished, ${d.created} added`}
                aria-label={`${longDay(d.day)}: ${duration(d.minutes)}`}
                className={cn("group relative flex h-full min-w-0 flex-1 items-end justify-center", i > 0 && "border-l border-dashed border-overlay/10")}>
                <span className={cn("w-[62%] max-w-10 rounded-t-[3px] transition-[height] duration-500", d.minutes > 0 ? "bg-accent-slow" : "bg-transparent")}
                  style={{ height: `${(d.minutes / top) * 100}%`, minHeight: d.minutes > 0 ? 3 : 0 }} />
              </button>
            ))}
          </div>
        </div>
        {/* values on the right, like 60m / 30m / 0 */}
        <div className="relative h-40 w-10 shrink-0 text-xs tabular-nums text-ink-faint" aria-hidden>
          <span className="absolute left-0 top-0 -translate-y-1/2">{hm(top)}</span>
          <span className="absolute left-0 top-1/2 -translate-y-1/2">{hm(top / 2)}</span>
          <span className="absolute bottom-0 left-0 translate-y-1/2">0</span>
        </div>
      </div>
      <div className="mr-[3.25rem] mt-2 flex">
        {days.map((d) => <span key={d.day} className="flex-1 text-center text-xs text-ink-muted">{label(d)}</span>)}
      </div>

      <div className="mt-5 grid grid-cols-3 gap-3 border-t border-overlay/10 pt-4 text-sm">
        <div><p className="text-accent-slow">Time worked</p><p className="mt-0.5 text-ink">{hm(total)}</p></div>
        <div><p className="text-[#5ED3D3]">Tasks finished</p><p className="mt-0.5 text-ink">{finished}{added ? <span className="text-ink-faint"> of {added} added</span> : null}</p></div>
        <div><p className="text-accent-fast">Best day</p><p className="mt-0.5 text-ink">{best ? `${label(best)} · ${hm(best.minutes)}` : "–"}</p></div>
      </div>
    </Card>
  );
}
