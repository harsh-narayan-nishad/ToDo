"use client";
import { useEffect, useMemo, useState } from "react";
import { Clock, Coins, ExternalLink, Link2, NotebookPen, Plus, Repeat2, Target } from "lucide-react";
import { PanelLoader } from "@/components/WheelSpinner";
import { Section, SettingsSheet } from "@/components/HabitDialogs";
import { clock, duration, today } from "@/lib/days";
import { lateFinishAllowed } from "@/lib/rules";
import type { Goal } from "@/lib/goals";
import { taskGoalIds, todoApi, type Task, type WorkLog } from "@/lib/todo";
import { cn } from "@/lib/utils";

/** "Sun 22 Nov" (with the year when it is not this year). */
const shortDay = (day: string) => {
  const d = new Date(day + "T12:00");
  return d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short", ...(d.getFullYear() !== new Date().getFullYear() ? { year: "numeric" } : {}) });
};
const span = (a: string, b: string) => Math.round((new Date(b + "T12:00").getTime() - new Date(a + "T12:00").getTime()) / 86_400_000);
const days = (n: number) => `${n} day${n === 1 ? "" : "s"}`;
/** Minutes a timed task was planned for (0 when all day). */
function planned(t: Task): number {
  if (!t.startTime || !t.endTime) return 0;
  const m = (x: string) => Number(x.slice(0, 2)) * 60 + Number(x.slice(3, 5));
  const n = span(t.startDay, t.dueDay) * 1440 + m(t.endTime) - m(t.startTime);
  return n > 0 ? n : 0;
}

/** Web addresses written anywhere in a text (http(s)://… or www.…), without trailing punctuation. */
const URL_RE = /\b((?:https?:\/\/|www\.)[^\s<>"')\]]+[^\s<>"')\].,;:!?])/gi;
const href = (u: string) => (/^https?:\/\//i.test(u) ? u : `https://${u}`);
function linksIn(...texts: string[]): string[] {
  const seen = new Set<string>();
  for (const t of texts) for (const m of t.matchAll(URL_RE)) seen.add(href(m[1]));
  return [...seen];
}
/** An empty section, as Apple's lists show one: a tinted icon tile, a short title and one quiet line. */
function Empty({ icon: Icon, title, hint, tint = "text-ink-muted bg-overlay/[0.07]" }: { icon: typeof Clock; title: string; hint: string; tint?: string }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <span className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-[10px]", tint)}><Icon className="h-[18px] w-[18px]" aria-hidden /></span>
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-medium text-ink">{title}</span>
        <span className="block text-[13px] leading-snug text-ink-muted">{hint}</span>
      </span>
    </div>
  );
}

/** Text with its web addresses as links that open in a new tab. */
function Linked({ text }: { text: string }) {
  const parts = text.split(URL_RE);
  return <>{parts.map((p, i) => (i % 2 === 1 ? <a key={i} href={href(p)} target="_blank" rel="noopener noreferrer" className="break-all text-[#3478F6] underline-offset-2 hover:underline">{p}</a> : p))}</>;
}

/**
 * One task's report, as the goal report shows a goal: what it is and where it stands (status, priority, notes), the
 * plan (days, time, length), time logged against planned, the goals it counts toward, how its routine is going when it
 * repeats, what to do (its notes, word for word), every link found in it as references, and every work log.
 */
export function TaskReportSheet({ task: t, tasks, goals, onClose, onAddNote }: { task: Task; tasks: Task[]; goals: Goal[]; onClose: () => void; /** Opens the note editor for this task. */ onAddNote?: () => void }) {
  const now = today();
  const [logs, setLogs] = useState<WorkLog[] | null>(null);
  useEffect(() => {
    const from = [t.createdDay, t.startDay].sort()[0];
    todoApi.logs(from, now > t.dueDay ? now : t.dueDay).then((l) => setLogs(l.filter((x) => x.taskId === t.id).sort((a, b) => b.day.localeCompare(a.day) || b.createdAt.localeCompare(a.createdAt))), () => setLogs([]));
  }, [t.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const done = t.status === "done";
  const plan = planned(t);
  const logged = t.loggedMinutes ?? 0;
  const linked = taskGoalIds(t).map((id) => goals.find((g) => g.id === id)).filter(Boolean) as Goal[];
  const routine = t.seriesId ? tasks.filter((x) => x.seriesId === t.seriesId) : [];
  const rDone = routine.filter((x) => x.status === "done").length;
  const rMissed = routine.filter((x) => x.status === "open" && x.dueDay < now && !lateFinishAllowed(x, now)).length;
  const links = useMemo(() => linksIn(t.title, t.notes ?? "", ...(logs ?? []).map((l) => l.note)), [t.title, t.notes, logs]);

  // where it stands
  const late = done && t.completedDay ? span(t.dueDay, t.completedDay) : 0;
  const status = done
    ? { text: late > 0 ? "Done late" : "Done", tone: late > 0 ? "bg-[#FF9500]/15 text-[#FF9500]" : "bg-accent-medium/15 text-accent-medium" }
    : t.dueDay < now
      ? lateFinishAllowed(t, now) ? { text: "Last day to tick off", tone: "bg-[#FF9500]/15 text-[#FF9500]" } : { text: "Missed", tone: "bg-accent-extreme/15 text-accent-extreme" }
      : t.startDay > now ? { text: "Upcoming", tone: "bg-[#3478F6]/[0.12] text-[#3478F6]" } : { text: "In progress", tone: "bg-[#3478F6]/[0.12] text-[#3478F6]" };
  const schedule = done
    ? t.completedDay ? (late > 0 ? `${days(late)} after the due day` : late < 0 ? `${days(-late)} early` : "On the due day") : "—"
    : t.dueDay < now ? `${days(span(t.dueDay, now))} overdue` : t.dueDay === now ? "Due today" : `Due in ${days(span(now, t.dueDay))}`;
  const pct = plan ? Math.min(100, Math.round((logged / plan) * 100)) : logged ? 100 : 0;
  const timeNote = logged === 0 ? "No time logged yet."
    : !plan ? "Logged without a planned length."
    : logged === plan ? "Exactly as planned."
    : logged > plan ? `${duration(logged - plan)} over the plan.` : `${duration(plan - logged)} left of the plan.`;

  const fact = (label: string, value: React.ReactNode, cls = "text-ink") => (
    <div className="px-4 py-3"><dt className="text-[12px] uppercase tracking-wide text-ink-faint">{label}</dt><dd className={cn("mt-0.5 text-[16px] font-medium", cls)}>{value}</dd></div>
  );
  const grid = "pw-group grid grid-cols-2 overflow-hidden rounded-[14px] [&>div:nth-child(even)]:border-l [&>div:nth-child(even)]:border-overlay/10 [&>div:nth-child(n+3)]:border-t [&>div:nth-child(n+3)]:border-overlay/10";

  return (
    <SettingsSheet label="Task report" onClose={onClose} compact>
      <div className="mb-6 px-1">
        <p className="break-words text-[22px] font-semibold leading-tight tracking-[-0.01em] text-ink"><Linked text={t.title} /></p>
        <p className="mt-2 flex flex-wrap items-center gap-2 text-[13px]">
          <span className={cn("rounded-full px-2.5 py-0.5 font-semibold", status.tone)}>{status.text}</span>
          <span className="rounded-full bg-overlay/[0.07] px-2.5 py-0.5 font-medium capitalize text-ink-muted">{t.priority} priority</span>
          {t.seriesId && <span className="inline-flex items-center gap-1 rounded-full bg-overlay/[0.07] px-2.5 py-0.5 font-medium text-ink-muted"><Repeat2 className="h-3 w-3" aria-hidden />Repeating</span>}
          {(t.coins ?? 0) > 0 && <span className="inline-flex items-center gap-1 rounded-full bg-[#F5B301]/15 px-2.5 py-0.5 font-semibold text-[#C98F00]"><Coins className="h-3 w-3" aria-hidden />{t.coins} coins</span>}
        </p>
      </div>

      <Section title="Overview">
        <dl className={grid}>
          {fact("Planned", t.dueDay !== t.startDay ? `${shortDay(t.startDay)} – ${shortDay(t.dueDay)}` : shortDay(t.startDay))}
          {fact("Time", t.startTime && t.endTime ? `${clock(t.startTime)} – ${clock(t.endTime)}` : "All day")}
          {fact("Length", plan ? duration(plan) : "—")}
          {fact(done ? "Finished" : "Schedule", done ? (t.completedDay ? shortDay(t.completedDay) : "—") : schedule, !done && t.dueDay < now ? "text-accent-extreme" : "text-ink")}
          {fact("Created", shortDay(t.createdDay))}
          {done ? fact("Against due day", schedule, late > 0 ? "text-[#FF9500]" : "text-accent-medium") : fact("Logged", logged ? duration(logged) : "—")}
        </dl>
      </Section>

      <Section title="Time">
        <div className="pw-group rounded-[14px] p-4">
          <div className="mb-1.5 flex justify-between text-[14px]"><span className="text-ink">Time logged</span><span className="tabular-nums text-ink-muted">{duration(logged)}{plan ? ` of ${duration(plan)} planned` : ""}</span></div>
          <div className="h-2 overflow-hidden rounded-full bg-overlay/10"><div className={cn("h-full rounded-full transition-[width] duration-500", plan && logged > plan ? "bg-accent-fast" : "bg-[#3478F6]")} style={{ width: `${pct}%` }} /></div>
          <p className="mt-2 text-[13px] text-ink-muted">{timeNote}</p>
        </div>
      </Section>

      <Section title="What to do" note={t.notes?.trim() ? "Exactly as written in the task's notes." : undefined}>
        {t.notes?.trim() ? (
          <div className="pw-group rounded-[14px] px-4 py-3.5">
            <p className="whitespace-pre-wrap break-words text-[15px] leading-relaxed text-ink"><Linked text={t.notes} /></p>
            {onAddNote && <button type="button" onClick={onAddNote} className="mt-3 text-[14px] font-medium text-[#3478F6]">Edit notes</button>}
          </div>
        ) : (
          <div className="pw-group overflow-hidden rounded-[14px]">
            <Empty icon={NotebookPen} title="No notes yet" hint="Steps, details and links you write will appear here." tint="text-[#3478F6] bg-[#3478F6]/[0.12]" />
            {onAddNote && (
              <button type="button" onClick={onAddNote} className="flex w-full items-center gap-3 border-t border-overlay/10 px-4 py-3 text-left text-[15px] font-medium text-[#3478F6] transition-colors hover:bg-overlay/[0.04] active:bg-overlay/[0.07]">
                <span className="grid h-9 w-9 shrink-0 place-items-center"><Plus className="h-5 w-5" strokeWidth={2.25} aria-hidden /></span>Add note
              </button>
            )}
          </div>
        )}
      </Section>

      {links.length === 0 ? (
        <Section title="References">
          <div className="pw-group overflow-hidden rounded-[14px]"><Empty icon={Link2} title="No references" hint="Links in the notes, the title or a work-log note appear here." /></div>
        </Section>
      ) : (
        <Section title={`References · ${links.length}`}>
          <ul className="pw-group overflow-hidden rounded-[14px]">
            {links.map((l, i) => {
              let host = l, path = "";
              try { const u = new URL(l); host = u.hostname.replace(/^www\./, ""); path = (u.pathname + u.search).replace(/\/$/, ""); } catch { /* shown as written */ }
              return (
                <li key={l} className={cn(i > 0 && "border-t border-overlay/10")}>
                  <a href={l} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-overlay/[0.04] active:bg-overlay/[0.07]">
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-[#3478F6]/[0.12] text-[#3478F6]"><Link2 className="h-4 w-4" aria-hidden /></span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[15px] text-ink">{host}</span>
                      {path && <span className="block truncate text-[12px] text-ink-faint">{path}</span>}
                    </span>
                    <ExternalLink className="h-4 w-4 shrink-0 text-ink-faint" aria-hidden />
                  </a>
                </li>
              );
            })}
          </ul>
        </Section>
      )}

      {linked.length > 0 && (
        <Section title="Counts toward">
          <ul className="pw-group overflow-hidden rounded-[14px]">
            {linked.map((g, i) => (
              <li key={g.id} className={cn("flex items-center gap-3 px-4 py-3", i > 0 && "border-t border-overlay/10")}>
                <Target className="h-4 w-4 shrink-0 text-[#FF9500]" aria-hidden />
                <span className="min-w-0 flex-1 truncate text-[15px] text-ink">{g.title}</span>
                <span className={cn("shrink-0 text-[12px]", g.status === "done" ? "text-accent-medium" : "text-ink-faint")}>{g.status === "done" ? "Reached" : `Due ${shortDay(g.dueDay)}`}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {t.seriesId && (
        <Section title="This routine" note={t.repeatUntil ? `Repeats until ${shortDay(t.repeatUntil)}${t.repeatDays ? `, on ${t.repeatDays} days in all` : ""}.` : undefined}>
          <dl className="pw-group grid grid-cols-3 overflow-hidden rounded-[14px] [&>div:not(:first-child)]:border-l [&>div]:border-overlay/10">
            {fact("Done", rDone, "text-accent-medium")}
            {fact("Missed", rMissed, rMissed ? "text-accent-extreme" : "text-ink")}
            {fact("Rate", rDone + rMissed ? `${Math.round((rDone / (rDone + rMissed)) * 100)}%` : "–")}
          </dl>
        </Section>
      )}

      {logs === null ? <PanelLoader label="Loading the work log" /> : logs.length === 0 ? (
        <Section title="Work log">
          <div className="pw-group overflow-hidden rounded-[14px]"><Empty icon={Clock} title="No sessions logged" hint="Time you log, with its note, appears here." /></div>
        </Section>
      ) : (
        <Section title={`Work log · ${logs.length}`}>
          <ul className="pw-group overflow-hidden rounded-[14px]">
            {logs.map((l, i) => (
              <li key={l.id} className={cn("flex items-start gap-3 px-4 py-3", i > 0 && "border-t border-overlay/10")}>
                <Clock className="mt-0.5 h-4 w-4 shrink-0 text-ink-faint" aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] text-ink">{shortDay(l.day)}{l.startTime ? <span className="text-ink-muted"> · {clock(l.startTime)}</span> : null}</span>
                  {l.note && <span className="block whitespace-pre-wrap break-words text-[13px] text-ink-muted"><Linked text={l.note} /></span>}
                </span>
                <span className="shrink-0 text-[14px] tabular-nums text-ink">{duration(l.minutes)}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}
    </SettingsSheet>
  );
}
