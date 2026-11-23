"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, ChevronLeft, ChevronRight, Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { PanelLoader } from "@/components/WheelSpinner";
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

  const [weekday, ...rest] = detail ? longDay(detail.day).split(", ") : ["", ""];

  return (
    <div className="flex flex-col gap-8">
      {/* Day picker: round arrows either side of the date, Today as a pill (Apple's grouped style, To-do's cards). */}
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => setDay(addDays(day, -1))} aria-label="Previous day" className="pw-circle-btn grid h-10 w-10 place-items-center rounded-full text-ink active:scale-95">
          <ChevronLeft className="h-5 w-5" strokeWidth={2} />
        </button>
        <input type="date" value={day} max={now} onChange={(e) => e.target.value && setDay(e.target.value)} aria-label="Day"
          className="pw-circle-btn h-10 rounded-full border-0 px-4 text-[15px] tabular-nums text-ink outline-none focus-visible:ring-2 focus-visible:ring-accent-medium" />
        <button type="button" onClick={() => setDay(addDays(day, 1))} disabled={day >= now} aria-label="Next day" className="pw-circle-btn grid h-10 w-10 place-items-center rounded-full text-ink active:scale-95 disabled:opacity-30">
          <ChevronRight className="h-5 w-5" strokeWidth={2} />
        </button>
        {day !== now && (
          <button type="button" onClick={() => setDay(now)} className="h-10 rounded-full bg-[#3478F6] px-4 text-[15px] font-medium text-white active:scale-[0.97]">Today</button>
        )}
      </div>

      {error && <p className="text-sm text-accent-extreme" role="alert">{error}</p>}

      {/* The wheel loader while the picked day loads (opening it from a bar, or moving to another day). */}
      {!error && (!detail || detail.day !== day) && <PanelLoader label="Loading the day" />}

      {detail && detail.day === day && (
        <section className="flex flex-col gap-6">
          <div className="px-1">
            <p className="text-[13px] font-medium uppercase tracking-[0.06em] text-ink-muted">{dayLabel(detail.day, now) === "Today" ? `Today · ${weekday}` : weekday}</p>
            <h2 className="mt-0.5 font-display text-3xl tracking-[-0.03em] text-ink sm:text-4xl">{rest.join(", ")}</h2>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <TaskList title="Finished" tasks={detail.completed} empty="Nothing finished this day." icon={Check} color="#34C759" />
            <TaskList title="Added" tasks={detail.created} empty="No tasks added this day." icon={Plus} color="#8E8E93" />
          </div>

          <Group title="Time log" right={detail.logs.length ? duration(detail.minutes) : undefined}>
            {detail.logs.length === 0 ? <p className="px-4 py-3.5 text-[15px] text-ink-faint">No time logged this day.</p> : (
              <ul>
                {detail.logs.map((l, i) => (
                  <li key={l.id} className="flex items-center gap-3 pl-4">
                    <span className="shrink-0 rounded-full bg-[#306fdb]/10 px-2.5 py-1 text-[13px] font-medium tabular-nums text-[#306fdb]">{duration(l.minutes)}</span>
                    <span className={cn("flex min-w-0 flex-1 items-center gap-3 py-3 pr-2", i > 0 && "border-t border-overlay/10")}>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[16px] text-ink">{l.taskTitle}</span>
                        {(l.startTime || l.note) && (
                          <span className="block truncate text-[13px] text-ink-muted">
                            {l.startTime && `${clock(l.startTime)} – ${clock(addMinutesToTime(l.startTime, l.minutes))}`}{l.startTime && l.note && " · "}{l.note}
                          </span>
                        )}
                      </span>
                      {l.day === now && (
                        <button type="button" aria-label="Remove entry" onClick={() => void removeLog(l.id)} className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-[#F2453D] active:bg-overlay/[0.08]">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Group>
        </section>
      )}

      <Group title="Last 30 days">
        {recent && byDay.length === 0 && <p className="px-4 py-3.5 text-[15px] text-ink-faint">No time logged in the last 30 days.</p>}
        {byDay.map(([d, logs], i) => (
          <button key={d} type="button" onClick={() => setDay(d)} className="flex w-full items-center gap-3 pl-4 text-left outline-none active:bg-overlay/[0.06] focus-visible:bg-overlay/[0.05]">
            <span className={cn("flex min-w-0 flex-1 items-center gap-3 py-3 pr-3", i > 0 && "border-t border-overlay/10")}>
              <span className="min-w-0 flex-1">
                <span className={cn("block text-[16px] text-ink", d === day && "font-medium")}>{dayLabel(d, now)}</span>
                <span className="block truncate text-[13px] text-ink-muted">{[...new Set(logs.map((l) => l.taskTitle))].join(" · ")}</span>
              </span>
              <span className="shrink-0 text-[15px] tabular-nums text-ink-muted">{duration(logs.reduce((a, l) => a + l.minutes, 0))}</span>
              <ChevronRight className="h-4 w-4 shrink-0 text-ink-faint" aria-hidden />
            </span>
          </button>
        ))}
      </Group>
    </div>
  );
}

/** An inset grouped list (as in iOS Settings): a quiet heading above a rounded card of rows. */
function Group({ title, right, children }: { title: string; right?: string; children: React.ReactNode }) {
  return (
    <section>
      <div className="mb-2 flex items-baseline justify-between px-4">
        <h3 className="text-[13px] font-medium uppercase tracking-[0.06em] text-ink-muted">{title}</h3>
        {right && <span className="text-[13px] tabular-nums text-ink-muted">{right}</span>}
      </div>
      <div className="pw-card overflow-hidden">{children}</div>
    </section>
  );
}

function TaskList({ title, tasks, empty, icon: Icon, color }: { title: string; tasks: Task[]; empty: string; icon: typeof Check; color: string }) {
  return (
    <Group title={title} right={tasks.length ? String(tasks.length) : undefined}>
      {tasks.length === 0 ? <p className="px-4 py-3.5 text-[15px] text-ink-faint">{empty}</p> : (
        <ul>
          {tasks.map((t, i) => (
            <li key={t.id} className="flex items-center gap-3 pl-4">
              <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full" style={{ backgroundColor: color, color: "#fff" }}><Icon className="h-3.5 w-3.5" strokeWidth={3} aria-hidden /></span>
              <span className={cn("min-w-0 flex-1 truncate py-3 pr-4 text-[16px] text-ink", i > 0 && "border-t border-overlay/10")}>{t.title}</span>
            </li>
          ))}
        </ul>
      )}
    </Group>
  );
}
