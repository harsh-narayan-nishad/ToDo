"use client";
import { useEffect, useMemo, useState } from "react";
import { Check, ChevronLeft, ChevronRight, CircleDashed, NotebookPen, Share2, X } from "lucide-react";
import { PanelLoader } from "@/components/WheelSpinner";
import { GoalReportSheet, GoalReportView } from "@/components/GoalsPanel";
import { GlassDropdown } from "@/components/GlassDropdown";
import { duration, today } from "@/lib/days";
import { PERIODS, goalsApi, periodLabel, span, type Goal, type GoalReport } from "@/lib/goals";
import { cn } from "@/lib/utils";

/** "Sun 29 Nov" (with the year when it is not this year). */
const shortDay = (day: string) => {
  const d = new Date(day + "T12:00");
  return d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short", ...(d.getFullYear() !== new Date().getFullYear() ? { year: "numeric" } : {}) });
};
const days = (n: number) => `${n} day${n === 1 ? "" : "s"}`;

/**
 * A year of goals in one read, laid out like History: the year (‹ 2026 ›), the score (reached, missed, in progress,
 * on time; tasks and time), then the goals reached, the goals missed (the failures), the goals in progress, and the
 * notes and reviews (mistakes, lessons). A tap on any goal opens its full report.
 */
export function GoalReviewPanel({ version }: { version: number }) {
  const now = today();
  const thisYear = new Date().getFullYear();
  const [year, setYear] = useState(thisYear);
  const [goals, setGoals] = useState<Goal[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<Goal | null>(null);
  /** One goal picked in the dropdown ("" = the whole year): the page then shows only that goal, its tasks and work. */
  const [focus, setFocus] = useState("");
  const [loaded, setLoaded] = useState<GoalReport | null>(null);
  const [shared, setShared] = useState<string | null>(null);
  useEffect(() => { goalsApi.list().then((g) => { setGoals(g); setError(null); }, (e) => setError(e instanceof Error ? e.message : "Could not load your goals.")); }, [version]);

  const y = String(year);
  /** A goal belongs to a year it was set, due or reached in. */
  const inYear = useMemo(() => (goals ?? []).filter((g) => g.startDay.startsWith(y) || g.dueDay.startsWith(y) || !!g.completedDay?.startsWith(y)), [goals, y]);
  const reached = inYear.filter((g) => g.status === "done").sort((a, b) => (b.completedDay ?? "").localeCompare(a.completedDay ?? ""));
  const missed = inYear.filter((g) => g.status === "open" && g.dueDay < now).sort((a, b) => b.dueDay.localeCompare(a.dueDay));
  const active = inYear.filter((g) => g.status === "open" && g.dueDay >= now).sort((a, b) => a.dueDay.localeCompare(b.dueDay));
  const tasksDone = inYear.reduce((a, g) => a + g.tasks.done, 0);
  const tasksAll = inYear.reduce((a, g) => a + g.tasks.total, 0);
  const logged = inYear.reduce((a, g) => a + (g.time?.loggedMinutes ?? 0), 0);
  const planned = inYear.reduce((a, g) => a + (g.time?.plannedMinutes ?? 0), 0);
  const reflections = inYear.filter((g) => g.notes?.trim() || g.review?.trim());

  if (error && !goals) return <p className="text-sm text-accent-extreme" role="alert">{error}</p>;
  if (!goals) return <PanelLoader label="Loading your goals" />;
  const picked = goals.find((g) => g.id === focus) ?? null;

  /** A plain-text summary of the picked goal, for the share sheet (or the clipboard). */
  async function share(r: GoalReport) {
    const g = r.goal;
    const end = g.status === "done" ? (g.completedDay ?? now) : now;
    const n = span(end, g.dueDay);
    const t = g.time ?? { plannedMinutes: 0, loggedMinutes: 0 };
    const text = [
      `Goal: ${g.title} (${periodLabel(g.period)})`,
      g.status === "done" ? `Reached ${shortDay(end)} · ${n === 0 ? "on the deadline" : n > 0 ? `${days(n)} early` : `${days(-n)} late`}` : n < 0 ? `Missed: deadline ${shortDay(g.dueDay)}, ${days(-n)} ago` : `In progress: due ${shortDay(g.dueDay)}, ${days(n)} left`,
      `Started ${shortDay(g.startDay)} · ${g.status === "done" ? `took ${days(span(g.startDay, end) + 1)}` : `${days(span(g.startDay, end) + 1)} so far`}`,
      `Tasks: ${g.tasks.done} of ${g.tasks.total} done`,
      `Time: ${duration(t.loggedMinutes)} logged${t.plannedMinutes ? ` of ${duration(t.plannedMinutes)} planned` : ""}`,
      ...(r.tasks.length ? ["", "Tasks:", ...r.tasks.map((x) => `${x.status === "done" ? "✓" : "○"} ${x.title}${x.loggedMinutes ? ` · ${duration(x.loggedMinutes)}` : ""}`)] : []),
      ...(g.notes?.trim() ? ["", `Notes: ${g.notes.trim()}`] : []),
      ...(g.review?.trim() ? ["", `Review: ${g.review.trim()}`] : []),
    ].join("\n");
    try {
      if (navigator.share) { await navigator.share({ title: g.title, text }); setShared("Shared."); }
      else { await navigator.clipboard.writeText(text); setShared("Copied to the clipboard."); }
    } catch (e) {
      if (!(e instanceof DOMException && e.name === "AbortError")) setShared("Could not share it.");
    }
    window.setTimeout(() => setShared(null), 2500);
  }
  const dropdown = (
    <GlassDropdown soft label="Goal" value={focus} display={picked?.title ?? "All goals"} className="ml-auto max-w-[55%] sm:max-w-xs" keepOpen={false}
      groups={[
        { title: "", items: [{ id: "", label: "All goals", meta: String(goals.length) }] },
        ...PERIODS.map((p) => ({ title: p.label, items: goals.filter((g) => g.period === p.id).map((g) => ({ id: g.id, label: g.title, meta: g.status === "done" ? "Reached" : g.dueDay < now ? "Missed" : undefined })) })).filter((g) => g.items.length > 0),
      ]}
      onSelect={(id) => { setFocus(id); setLoaded(null); }} />
  );

  // One goal: everything about it, its tasks only, and Share.
  if (picked) return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => setFocus("")} className="pw-circle-btn inline-flex h-10 items-center gap-1 rounded-full pl-3 pr-4 text-[15px] text-ink active:scale-95"><ChevronLeft className="h-5 w-5" strokeWidth={2} />All goals</button>
        {dropdown}
      </div>
      <GoalReportView key={picked.id} goalId={picked.id} title={picked.title} onLoaded={setLoaded} />
      <div className="flex flex-col items-center gap-2">
        <button type="button" disabled={!loaded} onClick={() => loaded && void share(loaded)}
          className="inline-flex h-12 w-full max-w-sm items-center justify-center gap-2 rounded-full bg-[#3478F6] text-[17px] font-semibold text-white shadow-themed transition-transform active:scale-[0.98] disabled:opacity-40">
          <Share2 className="h-[18px] w-[18px]" strokeWidth={2.25} aria-hidden />Share this goal
        </button>
        {shared && <p className="text-[13px] text-ink-muted" role="status">{shared}</p>}
      </div>
    </div>
  );

  const group = (title: string, count: number, body: React.ReactNode) => (
    <section>
      <div className="mb-2 flex items-baseline justify-between px-4">
        <h3 className="text-[13px] font-medium uppercase tracking-[0.06em] text-ink-muted">{title}</h3>
        {count > 0 && <span className="text-[13px] tabular-nums text-ink-muted">{count}</span>}
      </div>
      <div className="pw-card overflow-hidden">{body}</div>
    </section>
  );
  const empty = (text: string) => <p className="px-4 py-3.5 text-[15px] text-ink-faint">{text}</p>;
  const row = (g: Goal, i: number, icon: React.ReactNode, sub: React.ReactNode) => (
    <li key={g.id}>
      <button type="button" onClick={() => setReport(g)} className="flex w-full items-center gap-3 pl-4 text-left outline-none active:bg-overlay/[0.06] focus-visible:bg-overlay/[0.05]">
        {icon}
        <span className={cn("flex min-w-0 flex-1 items-center gap-3 py-3 pr-3", i > 0 && "border-t border-overlay/10")}>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[16px] text-ink">{g.title}</span>
            <span className="line-clamp-2 block text-[13px] leading-snug text-ink-muted">{sub}</span>
          </span>
          <ChevronRight className="h-4 w-4 shrink-0 text-ink-faint" aria-hidden />
        </span>
      </button>
    </li>
  );
  const dot = (bg: string, child: React.ReactNode) => <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-white" style={{ backgroundColor: bg }}>{child}</span>;
  const work = (g: Goal) => [g.tasks.total ? `${g.tasks.done}/${g.tasks.total} tasks` : null, g.time?.loggedMinutes ? `${duration(g.time.loggedMinutes)} logged` : null].filter(Boolean).join(" · ");

  return (
    <div className="flex flex-col gap-8">
      {/* The year: round arrows either side, This year as a pill (History's day picker). */}
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => setYear(year - 1)} aria-label="Previous year" className="pw-circle-btn grid h-10 w-10 place-items-center rounded-full text-ink active:scale-95"><ChevronLeft className="h-5 w-5" strokeWidth={2} /></button>
        <span className="pw-circle-btn grid h-10 place-items-center rounded-full px-5 text-[15px] tabular-nums text-ink">{year}</span>
        <button type="button" onClick={() => setYear(year + 1)} disabled={year >= thisYear} aria-label="Next year" className="pw-circle-btn grid h-10 w-10 place-items-center rounded-full text-ink active:scale-95 disabled:opacity-30"><ChevronRight className="h-5 w-5" strokeWidth={2} /></button>
        {year !== thisYear && <button type="button" onClick={() => setYear(thisYear)} className="h-10 rounded-full bg-[#3478F6] px-4 text-[15px] font-medium text-white active:scale-[0.97]">This year</button>}
        {goals.length > 0 && dropdown}
      </div>

      <div className="px-1">
        <p className="text-[13px] font-medium uppercase tracking-[0.06em] text-ink-muted">{year === thisYear ? `This year · ${year}` : year}</p>
        <h2 className="mt-0.5 font-display text-3xl tracking-[-0.03em] text-ink sm:text-4xl">{reached.length} of {inYear.length} goal{inYear.length === 1 ? "" : "s"} reached</h2>
        <p className="mt-1 text-[14px] text-ink-muted">
          {tasksAll ? `${tasksDone} of ${tasksAll} linked tasks done` : "No tasks linked to these goals"}{logged || planned ? ` · ${duration(logged)} logged${planned ? ` of ${duration(planned)} planned` : ""}` : ""}
        </p>
      </div>

      {group("Reached", reached.length, reached.length ? <ul>{reached.map((g, i) => {
        const n = span(g.completedDay ?? now, g.dueDay);
        return row(g, i, dot("#34C759", <Check className="h-3.5 w-3.5" strokeWidth={3} aria-hidden />),
          <>{periodLabel(g.period)} · reached {shortDay(g.completedDay ?? now)} · <span className={n < 0 ? "text-accent-extreme" : "text-accent-medium"}>{n === 0 ? "on the deadline" : n > 0 ? `${days(n)} early` : `${days(-n)} late`}</span>{work(g) ? ` · ${work(g)}` : ""}</>);
      })}</ul> : empty(`No goals reached in ${year} yet.`))}

      {group("Missed", missed.length, missed.length ? <ul>{missed.map((g, i) => row(g, i, dot("#FF3B30", <X className="h-3.5 w-3.5" strokeWidth={3} aria-hidden />),
        <>{periodLabel(g.period)} · deadline {shortDay(g.dueDay)} · <span className="text-accent-extreme">missed by {days(span(g.dueDay, now))}</span>{work(g) ? ` · ${work(g)}` : ""}</>))}</ul>
        : empty(year === thisYear ? "No missed deadlines. Keep it up." : `No missed deadlines in ${year}.`))}

      {group("In progress", active.length, active.length ? <ul>{active.map((g, i) => row(g, i, dot("#3478F6", <CircleDashed className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden />),
        <>{periodLabel(g.period)} · due {shortDay(g.dueDay)} · {days(span(now, g.dueDay))} left{work(g) ? ` · ${work(g)}` : ""}</>))}</ul>
        : empty("Nothing in progress."))}

      {/* What was learned: each goal's notes and review (what went well, mistakes, failures). */}
      {group("Notes & lessons", reflections.length, reflections.length ? (
        <ul>
          {reflections.map((g, i) => (
            <li key={g.id} className={cn("px-4 py-3.5", i > 0 && "border-t border-overlay/10")}>
              <button type="button" onClick={() => setReport(g)} className="flex w-full items-center gap-2 text-left">
                <NotebookPen className="h-4 w-4 shrink-0 text-[#FF9500]" aria-hidden />
                <span className="min-w-0 flex-1 truncate text-[16px] font-medium text-ink">{g.title}</span>
                <span className={cn("shrink-0 text-[12px] font-medium", g.status === "done" ? "text-accent-medium" : g.dueDay < now ? "text-accent-extreme" : "text-ink-faint")}>{g.status === "done" ? "Reached" : g.dueDay < now ? "Missed" : "In progress"}</span>
              </button>
              {g.notes?.trim() && <p className="mt-2 whitespace-pre-wrap break-words text-[14px] text-ink-muted"><span className="font-medium text-ink">Notes. </span>{g.notes}</p>}
              {g.review?.trim() && <p className="mt-2 whitespace-pre-wrap break-words rounded-xl bg-overlay/[0.04] px-3 py-2 text-[14px] text-ink"><span className="font-medium">Review. </span>{g.review}</p>}
            </li>
          ))}
        </ul>
      ) : empty("No notes or reviews yet. Edit a goal to add a review: what went well, mistakes and lessons."))}

      {report && <GoalReportSheet goalId={report.id} title={report.title} onClose={() => setReport(null)} />}
    </div>
  );
}
