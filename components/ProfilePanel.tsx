"use client";
import { useEffect, useState } from "react";
import { PanelLoader } from "@/components/WheelSpinner";
import { Flame } from "lucide-react";
import { Card, Stat } from "@/components/ui";
import { Heatmap } from "@/components/Heatmap";
import type { User } from "@/lib/api";
import { dayLabel, duration } from "@/lib/days";
import { todoApi, type Summary } from "@/lib/todo";
import { cn } from "@/lib/utils";

const LEVEL_COLOR = ["text-ink-faint", "text-accent-slow", "text-accent-slow", "text-accent-medium", "text-accent-fast", "text-accent-extreme"];

/** Totals, hours worked, streaks and the consistency level, all from the server. */
export function ProfilePanel({ user, version, onOpenDay }: { user: User; version: number; onOpenDay: (day: string) => void }) {
  const [data, setData] = useState<Summary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    todoApi.summary().then((s) => { setData(s); setError(null); }, (e) => setError(e instanceof Error ? e.message : "Could not load your profile."));
  }, [version]);

  if (error) return <p className="text-sm text-accent-extreme" role="alert">{error}</p>;
  if (!data) return <PanelLoader label="Loading your profile" />;
  const { totals: t, consistency: c } = data;
  const maxMin = Math.max(60, ...data.heatmap.slice(-7).map((d) => d.minutes));

  return (
    <div className="flex flex-col gap-8">
      <Card className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          {user.avatarUrl ? <img src={user.avatarUrl} alt="" className="h-14 w-14 object-cover" /> : (
            <span className="flex h-14 w-14 items-center justify-center bg-overlay/10 font-display text-2xl">{user.name.slice(0, 1).toUpperCase()}</span>
          )}
          <div>
            <p className="text-xl text-ink">{user.name}</p>
            <p className="text-sm text-ink-muted">@{user.username}</p>
          </div>
        </div>
        <div className="sm:text-right">
          <p className="text-sm text-ink-muted">Consistency level</p>
          <p className={cn("font-display text-3xl", LEVEL_COLOR[c.level])}>{c.label}</p>
          <div className="mt-2 h-1.5 w-full bg-overlay/10 sm:w-56" role="progressbar" aria-valuenow={c.percent} aria-valuemin={0} aria-valuemax={100}>
            <div className="h-full bg-accent-medium transition-all" style={{ width: `${c.percent}%` }} />
          </div>
          <p className="mt-1 text-xs text-ink-faint">Active {c.last30ActiveDays} of the last 30 days ({c.percent}%)</p>
        </div>
      </Card>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Tasks created" value={t.created} />
        <Stat label="Tasks finished" value={t.completed} tone="green" hint={t.created ? `${Math.round((t.completed / t.created) * 100)}% of created` : undefined} />
        <Stat label="Open" value={t.open} hint={t.overdue ? `${t.overdue} overdue` : "none overdue"} tone={t.overdue ? "red" : undefined} />
        <Stat label="Hours worked" value={`${t.hours} h`} tone="blue" hint={t.workedDays ? `about ${duration(t.avgMinutesPerWorkedDay)} per working day` : "log time on a task"} />
        <Stat label="Current streak" value={`${c.currentStreak} d`} tone={c.currentStreak > 0 ? "amber" : undefined} hint={c.todayActive ? "today counted" : c.currentStreak > 0 ? "do something today to keep it" : undefined} />
        <Stat label="Longest streak" value={`${c.longestStreak} d`} />
        <Stat label="Active days" value={c.activeDays} hint="days with work logged or a task finished" />
        <Stat label="Days with time logged" value={t.workedDays} />
      </div>

      <Card>
        <div className="mb-4 flex items-center gap-2"><Flame className="h-4 w-4 text-accent-fast" /><h2 className="text-sm uppercase tracking-wide text-ink-muted">Last 7 days</h2></div>
        <div className="flex h-36 items-end gap-2">
          {data.heatmap.slice(-7).map((d) => (
            <button key={d.day} onClick={() => onOpenDay(d.day)} className="group flex h-full flex-1 flex-col items-center justify-end gap-2" title={`${duration(d.minutes)}, ${d.completed} finished`}>
              <span className="text-[11px] text-ink-faint opacity-0 transition-opacity group-hover:opacity-100">{duration(d.minutes)}</span>
              <span className={cn("w-full transition-colors", d.level > 0 ? "bg-accent-medium/70 group-hover:bg-accent-medium" : "bg-overlay/10")} style={{ height: `${Math.max(4, (d.minutes / maxMin) * 100)}%` }} />
              <span className="text-xs text-ink-muted">{dayLabel(d.day).slice(0, 3)}</span>
            </button>
          ))}
        </div>
      </Card>

      <Card>
        <h2 className="mb-4 text-sm uppercase tracking-wide text-ink-muted">Consistency · last 26 weeks</h2>
        <Heatmap days={data.heatmap} onOpenDay={onOpenDay} />
        <p className="mt-4 text-xs text-ink-faint">A day counts when you log any time or finish a task, the same rule Pacewise uses for reading streaks. Click a day to see what you did.</p>
      </Card>
    </div>
  );
}
