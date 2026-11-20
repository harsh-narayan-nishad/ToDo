"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Trash2 } from "lucide-react";
import { Button, Card, Empty, FIELD, Stat } from "@/components/ui";
import { addDays, addMinutesToTime, clock, dayLabel, duration, longDay, today } from "@/lib/days";
import { todoApi, type DayDetail, type Task, type WorkLog } from "@/lib/todo";

/** "What did I do on day X?" plus the recent time log, grouped by day. */
export function HistoryPanel({ day, setDay, version, onChanged }: { day: string; setDay: (d: string) => void; version: number; onChanged: () => void }) {
  const now = today();
  const [detail, setDetail] = useState<DayDetail | null>(null);
  const [recent, setRecent] = useState<WorkLog[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [d, r] = await Promise.all([todoApi.day(day), todoApi.logs(addDays(now, -29), now)]);
      setDetail(d);
      setRecent(r);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load history.");
    }
  }, [day, now]);
  useEffect(() => { void load(); }, [load, version]);

  async function removeLog(id: string) {
    try { await todoApi.removeLog(id); onChanged(); await load(); } catch (e) { setError(e instanceof Error ? e.message : "Could not remove."); }
  }

  const byDay = useMemo(() => {
    const m = new Map<string, WorkLog[]>();
    for (const l of recent ?? []) m.set(l.day, [...(m.get(l.day) ?? []), l]);
    return [...m.entries()];
  }, [recent]);

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-end gap-3">
        <Button variant="outline" size="sm" onClick={() => setDay(addDays(day, -1))} aria-label="Previous day"><ChevronLeft className="h-4 w-4" /></Button>
        <input type="date" value={day} max={now} onChange={(e) => e.target.value && setDay(e.target.value)} className={FIELD + " mt-0 w-auto"} aria-label="Day" />
        <Button variant="outline" size="sm" onClick={() => setDay(addDays(day, 1))} disabled={day >= now} aria-label="Next day"><ChevronRight className="h-4 w-4" /></Button>
        {day !== now && <Button variant="ghost" size="sm" onClick={() => setDay(now)}>Today</Button>}
      </div>

      {error && <p className="text-sm text-accent-extreme" role="alert">{error}</p>}

      {detail && (
        <section className="flex flex-col gap-5">
          <h2 className="font-display text-2xl">{longDay(detail.day)}</h2>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="Time worked" value={duration(detail.minutes)} tone={detail.minutes > 0 ? "green" : undefined} />
            <Stat label="Tasks added" value={detail.created.length} />
            <Stat label="Tasks finished" value={detail.completed.length} tone={detail.completed.length > 0 ? "green" : undefined} />
            <Stat label="Planned for the day" value={detail.planned.length} />
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <TaskList title="Finished" tasks={detail.completed} empty="Nothing finished this day." />
            <TaskList title="Added" tasks={detail.created} empty="No tasks added this day." />
          </div>
          <Card>
            <h3 className="mb-3 text-sm uppercase tracking-wide text-ink-muted">Time log</h3>
            {detail.logs.length === 0 ? <p className="text-sm text-ink-faint">No time logged this day.</p> : (
              <ul className="flex flex-col divide-y divide-overlay/10">
                {detail.logs.map((l) => (
                  <li key={l.id} className="flex items-center gap-3 py-2.5">
                    <span className="w-24 shrink-0 font-mono text-sm text-accent-medium">{duration(l.minutes)}</span>
                    <span className="min-w-0 flex-1">
                      <span className="text-ink">{l.taskTitle}</span>
                      {l.startTime && <span className="ml-2 text-sm text-ink-faint">{clock(l.startTime)} – {clock(addMinutesToTime(l.startTime, l.minutes))}</span>}
                      {l.note && <span className="block text-sm text-ink-muted">{l.note}</span>}
                    </span>
                    {l.day === now && <Button size="sm" variant="ghost" aria-label="Remove entry" onClick={() => void removeLog(l.id)}><Trash2 className="h-4 w-4" /></Button>}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </section>
      )}

      <section>
        <h2 className="mb-3 text-sm uppercase tracking-wide text-ink-muted">Last 30 days</h2>
        {recent && byDay.length === 0 && <Empty>No time logged in the last 30 days.</Empty>}
        <div className="flex flex-col gap-3">
          {byDay.map(([d, logs]) => (
            <button key={d} onClick={() => setDay(d)} className="flex flex-col gap-1 border border-overlay/10 bg-canvas-raised px-4 py-3 text-left transition-colors ">
              <span className="flex items-center justify-between gap-3">
                <span className="text-ink">{dayLabel(d, now)}</span>
                <span className="font-mono text-sm text-accent-medium">{duration(logs.reduce((a, l) => a + l.minutes, 0))}</span>
              </span>
              <span className="truncate text-sm text-ink-muted">{[...new Set(logs.map((l) => l.taskTitle))].join(" · ")}</span>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}

function TaskList({ title, tasks, empty }: { title: string; tasks: Task[]; empty: string }) {
  return (
    <Card>
      <h3 className="mb-3 text-sm uppercase tracking-wide text-ink-muted">{title}</h3>
      {tasks.length === 0 ? <p className="text-sm text-ink-faint">{empty}</p> : (
        <ul className="flex flex-col gap-2">{tasks.map((t) => <li key={t.id} className="text-ink">{t.title}</li>)}</ul>
      )}
    </Card>
  );
}
