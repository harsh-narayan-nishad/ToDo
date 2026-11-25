"use client";
import { useEffect, useMemo, useState } from "react";
import { ChevronRight, Clock, Repeat2, X } from "lucide-react";
import { PanelLoader } from "@/components/WheelSpinner";
import { Section, SettingsSheet } from "@/components/HabitDialogs";
import { clock, duration, today } from "@/lib/days";
import { lateFinishAllowed } from "@/lib/rules";
import { goalsApi, type Goal } from "@/lib/goals";
import { taskGoalIds, todoApi, type Task } from "@/lib/todo";
import { cn } from "@/lib/utils";

/** "Sun 22 Nov" (with the year when it is not this year). */
const shortDay = (day: string) => {
  const d = new Date(day + "T12:00");
  return d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short", ...(d.getFullYear() !== new Date().getFullYear() ? { year: "numeric" } : {}) });
};
const monthOf = (day: string) => new Date(day + "T12:00").toLocaleDateString(undefined, { month: "long", year: "numeric" });
const span = (a: string, b: string) => Math.round((new Date(b + "T12:00").getTime() - new Date(a + "T12:00").getTime()) / 86_400_000);
const days = (n: number) => `${n} day${n === 1 ? "" : "s"}`;
/** Minutes a timed task was planned for (0 when all day). */
function planned(t: Task): number {
  if (!t.startTime || !t.endTime) return 0;
  const m = (x: string) => Number(x.slice(0, 2)) * 60 + Number(x.slice(3, 5));
  const n = span(t.startDay, t.dueDay) * 1440 + m(t.endTime) - m(t.startTime);
  return n > 0 ? n : 0;
}

/**
 * Every overdue task in one read, like History: how many, those that can still be ticked off today (their one grace
 * day), then everything missed, newest first and by month. A tap on any opens its report.
 */
export function OverduePanel({ version }: { version: number }) {
  const now = today();
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<Task | null>(null);
  useEffect(() => {
    todoApi.tasks().then((t) => { setTasks(t); setError(null); }, (e) => setError(e instanceof Error ? e.message : "Could not load your tasks."));
    goalsApi.list().then(setGoals, () => undefined);
  }, [version]);

  const overdue = useMemo(() => (tasks ?? []).filter((t) => t.status === "open" && t.dueDay < now).sort((a, b) => b.dueDay.localeCompare(a.dueDay) || (a.startTime ?? "").localeCompare(b.startTime ?? "")), [tasks, now]);
  const lastDay = overdue.filter((t) => lateFinishAllowed(t, now));
  const missed = overdue.filter((t) => !lateFinishAllowed(t, now));
  const months = useMemo(() => {
    const m = new Map<string, Task[]>();
    for (const t of missed) m.set(monthOf(t.dueDay), [...(m.get(monthOf(t.dueDay)) ?? []), t]);
    return [...m.entries()];
  }, [missed]);

  if (error && !tasks) return <p className="text-sm text-accent-extreme" role="alert">{error}</p>;
  if (!tasks) return <PanelLoader label="Loading overdue tasks" />;

  const group = (title: string, count: number, list: Task[], tone: string) => (
    <section key={title}>
      <div className="mb-2 flex items-baseline justify-between px-4">
        <h3 className={cn("text-[13px] font-medium uppercase tracking-[0.06em]", tone)}>{title}</h3>
        <span className="text-[13px] tabular-nums text-ink-muted">{count}</span>
      </div>
      <ul className="pw-card overflow-hidden">
        {list.map((t, i) => {
          const late = span(t.dueDay, now);
          return (
            <li key={t.id}>
              <button type="button" onClick={() => setReport(t)} className="flex w-full items-center gap-3 pl-4 text-left outline-none active:bg-overlay/[0.06] focus-visible:bg-overlay/[0.05]">
                <span className={cn("grid h-6 w-6 shrink-0 place-items-center rounded-full text-white", lateFinishAllowed(t, now) ? "bg-[#FF9500]" : "bg-[#FF3B30]")}>
                  {lateFinishAllowed(t, now) ? <Clock className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden /> : <X className="h-3.5 w-3.5" strokeWidth={3} aria-hidden />}
                </span>
                <span className={cn("flex min-w-0 flex-1 items-center gap-3 py-3 pr-3", i > 0 && "border-t border-overlay/10")}>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                      <span className="truncate text-[16px] text-ink">{t.title}</span>
                      {t.seriesId && <Repeat2 className="h-3.5 w-3.5 shrink-0 text-ink-faint" aria-label="Repeating" />}
                    </span>
                    <span className="line-clamp-2 block text-[13px] leading-snug text-ink-muted">
                      {shortDay(t.dueDay)}{t.startTime ? ` · ${clock(t.startTime)}` : ""} · <span className="text-accent-extreme">{late === 1 ? "yesterday" : `${days(late)} overdue`}</span>
                      {(t.loggedMinutes ?? 0) > 0 ? ` · ${duration(t.loggedMinutes ?? 0)} logged` : ""}
                    </span>
                  </span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-ink-faint" aria-hidden />
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );

  return (
    <div className="flex flex-col gap-8">
      <div className="px-1">
        <p className="text-[13px] font-medium uppercase tracking-[0.06em] text-ink-muted">Overdue</p>
        <h2 className="mt-0.5 font-display text-3xl tracking-[-0.03em] text-ink sm:text-4xl">{overdue.length ? `${overdue.length} task${overdue.length === 1 ? "" : "s"} overdue` : "Nothing overdue"}</h2>
        <p className="mt-1 text-[14px] text-ink-muted">
          {overdue.length ? `${lastDay.length} can still be ticked off today · ${missed.length} missed` : "Every task is done or still on time."}
        </p>
      </div>
      {lastDay.length > 0 && group("Last day to tick off", lastDay.length, lastDay, "text-[#FF9500]")}
      {months.map(([m, list]) => group(`Missed · ${m}`, list.length, list, "text-accent-extreme"))}
      {report && <OverdueReport task={report} tasks={tasks} goals={goals} onClose={() => setReport(null)} />}
    </div>
  );
}

/**
 * One overdue task's report: what was planned (day, time, length), how late it is, time logged against planned, the
 * goals it counts toward, its notes, and for a repeating task how the whole routine is going.
 */
function OverdueReport({ task: t, tasks, goals, onClose }: { task: Task; tasks: Task[]; goals: Goal[]; onClose: () => void }) {
  const now = today();
  const grace = lateFinishAllowed(t, now);
  const plan = planned(t);
  const logged = t.loggedMinutes ?? 0;
  const linked = taskGoalIds(t).map((id) => goals.find((g) => g.id === id)?.title).filter(Boolean) as string[];
  const routine = t.seriesId ? tasks.filter((x) => x.seriesId === t.seriesId) : [];
  const done = routine.filter((x) => x.status === "done").length;
  const miss = routine.filter((x) => x.status === "open" && x.dueDay < now && !lateFinishAllowed(x, now)).length;
  const fact = (label: string, value: React.ReactNode, cls = "text-ink") => (
    <div className="px-4 py-3"><dt className="text-[12px] uppercase tracking-wide text-ink-faint">{label}</dt><dd className={cn("mt-0.5 text-[16px] font-medium", cls)}>{value}</dd></div>
  );
  return (
    <SettingsSheet label="Overdue report" onClose={onClose}>
      <div className="mb-6 px-1">
        <p className="break-words text-[22px] font-semibold leading-tight tracking-[-0.01em] text-ink">{t.title}</p>
        <p className="mt-2 flex flex-wrap items-center gap-2 text-[13px]">
          <span className={cn("rounded-full px-2.5 py-0.5 font-semibold", grace ? "bg-[#FF9500]/15 text-[#FF9500]" : "bg-accent-extreme/15 text-accent-extreme")}>{grace ? "Last day to tick off" : "Missed"}</span>
          <span className="rounded-full bg-overlay/[0.07] px-2.5 py-0.5 font-medium capitalize text-ink-muted">{t.priority} priority</span>
          {t.seriesId && <span className="inline-flex items-center gap-1 rounded-full bg-overlay/[0.07] px-2.5 py-0.5 font-medium text-ink-muted"><Repeat2 className="h-3 w-3" aria-hidden />Repeating</span>}
        </p>
        {t.notes && <p className="mt-3 whitespace-pre-wrap break-words text-[14px] text-ink-muted">{t.notes}</p>}
      </div>

      <Section title="Overview">
        <dl className="pw-group grid grid-cols-2 overflow-hidden rounded-[14px] [&>div:nth-child(even)]:border-l [&>div:nth-child(even)]:border-overlay/10 [&>div:nth-child(n+3)]:border-t [&>div:nth-child(n+3)]:border-overlay/10">
          {fact("Planned", shortDay(t.startDay))}
          {fact("Time", t.startTime && t.endTime ? `${clock(t.startTime)} – ${clock(t.endTime)}` : "All day")}
          {fact("Due", shortDay(t.dueDay))}
          {fact("Overdue by", days(span(t.dueDay, now)), "text-accent-extreme")}
          {fact("Created", shortDay(t.createdDay))}
          {fact("Status", grace ? "Can still be ticked today" : "Missed", grace ? "text-[#FF9500]" : "text-accent-extreme")}
        </dl>
      </Section>

      <Section title="Time">
        <div className="pw-group rounded-[14px] p-4">
          <div className="mb-1.5 flex justify-between text-[14px]"><span className="text-ink">Time logged</span><span className="tabular-nums text-ink-muted">{duration(logged)}{plan ? ` of ${duration(plan)} planned` : ""}</span></div>
          <div className="h-2 overflow-hidden rounded-full bg-overlay/10"><div className="h-full rounded-full bg-[#3478F6]" style={{ width: `${plan ? Math.min(100, Math.round((logged / plan) * 100)) : logged ? 100 : 0}%` }} /></div>
          <p className="mt-2 text-[13px] text-ink-muted">{logged === 0 ? "No time was logged on it." : plan ? (logged >= plan ? "The planned time was worked; it was just not ticked off." : `${duration(plan - logged)} short of the plan.`) : "Logged, but it was not ticked off."}</p>
        </div>
      </Section>

      {linked.length > 0 && (
        <Section title="Goals">
          <ul className="pw-group overflow-hidden rounded-[14px]">
            {linked.map((g, i) => <li key={g} className={cn("px-4 py-3 text-[15px] text-ink", i > 0 && "border-t border-overlay/10")}>{g}</li>)}
          </ul>
        </Section>
      )}

      {t.seriesId && (
        <Section title="This routine" note={t.repeatUntil ? `Repeats until ${shortDay(t.repeatUntil)}${t.repeatDays ? `, on ${t.repeatDays} days in all` : ""}.` : undefined}>
          <dl className="pw-group grid grid-cols-3 overflow-hidden rounded-[14px] [&>div:not(:first-child)]:border-l [&>div]:border-overlay/10">
            {fact("Done", done, "text-accent-medium")}
            {fact("Missed", miss, miss ? "text-accent-extreme" : "text-ink")}
            {fact("Rate", done + miss ? `${Math.round((done / (done + miss)) * 100)}%` : "–")}
          </dl>
        </Section>
      )}
    </SettingsSheet>
  );
}
