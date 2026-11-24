"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { BarChart3, Check, ChevronRight, Clock, MoreHorizontal, Pencil, Plus, RotateCcw, Target, Trash2 } from "lucide-react";
import { Badge, ConfirmDialog, Empty } from "@/components/ui";
import { PanelLoader, ButtonWheel } from "@/components/WheelSpinner";
import { DropdownMenu } from "@/components/GlassDropdown";
import { ROW, ROW_INPUT, Section, Segmented, SettingsSheet } from "@/components/HabitDialogs";
import { addDays, duration, longDay, today } from "@/lib/days";
import { PERIODS, deadlineLabel, goalsApi, periodEnd, periodLabel, span, type Goal, type GoalInput, type GoalPeriod, type GoalReport } from "@/lib/goals";
import { cn } from "@/lib/utils";

type Filter = "all" | GoalPeriod;
const FILTERS: { id: Filter; label: string }[] = [{ id: "all", label: "All" }, ...PERIODS.map((p) => ({ id: p.id as Filter, label: p.short }))];
/** "Sun, 29 Nov" (the year only when it is not this year). */
const shortDay = (day: string) => {
  const d = new Date(day + "T12:00");
  return d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short", ...(d.getFullYear() !== new Date().getFullYear() ? { year: "numeric" } : {}) });
};
const TONE = { ok: "text-ink-muted", soon: "text-accent-fast", late: "text-accent-extreme", done: "text-accent-medium" } as const;

/**
 * Goals with a deadline: weekly, monthly, quarterly and yearly. Each shows its deadline and how many of its tasks are
 * finished (tasks are linked to a goal when they are added in the planner, or edited). Tick a goal when it is reached.
 */
export function GoalsPanel({ version, onChanged }: { version: number; onChanged: () => void }) {
  const [goals, setGoals] = useState<Goal[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [editing, setEditing] = useState<{ goal?: Goal } | null>(null);
  const [deleting, setDeleting] = useState<Goal | null>(null);

  useEffect(() => {
    goalsApi.list().then((g) => { setGoals(g); setError(null); }, (e) => setError(e instanceof Error ? e.message : "Could not load your goals."));
  }, [version]);

  const put = (g: Goal) => setGoals((l) => (l ?? []).some((x) => x.id === g.id) ? (l ?? []).map((x) => (x.id === g.id ? g : x)) : [...(l ?? []), g]);
  async function toggle(g: Goal) {
    try { put(await goalsApi.update(g.id, { status: g.status === "done" ? "open" : "done" })); onChanged(); } catch (e) { setError(e instanceof Error ? e.message : "Could not update the goal."); }
  }

  const shown = useMemo(() => (goals ?? []).filter((g) => filter === "all" || g.period === filter), [goals, filter]);
  const open = shown.filter((g) => g.status === "open").sort((a, b) => a.dueDay.localeCompare(b.dueDay));
  const reached = shown.filter((g) => g.status === "done").sort((a, b) => (b.completedDay ?? "").localeCompare(a.completedDay ?? ""));

  if (error && !goals) return <p className="text-sm text-accent-extreme" role="alert">{error}</p>;
  if (!goals) return <PanelLoader label="Loading your goals" />;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="w-full sm:max-w-md"><Segmented soft label="Show goals" value={filter} options={FILTERS} onChange={setFilter} /></div>
        <button type="button" onClick={() => setEditing({})}
          className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-full bg-[#3478F6] px-5 text-[15px] font-semibold text-white shadow-themed transition-transform active:scale-[0.97]">
          <Plus className="h-[18px] w-[18px]" strokeWidth={2.5} />New goal
        </button>
      </div>
      {error && <p className="text-sm text-accent-extreme" role="alert">{error}</p>}

      {open.length === 0 && reached.length === 0 && (
        <Empty>{filter === "all" ? "No goals yet. Set one for this week, month, quarter or year, then link tasks to it when you add them." : `No ${periodLabel(filter as GoalPeriod).toLowerCase()} goals yet.`}</Empty>
      )}
      {/* In progress: under All, one section per horizon (weekly, monthly, quarterly, yearly, long-term). */}
      {filter === "all"
        ? PERIODS.map((p) => ({ p, list: open.filter((g) => g.period === p.id) })).filter((x) => x.list.length > 0).map(({ p, list }) => (
            <GoalList key={p.id} title={p.label} goals={list} onToggle={toggle} onEdit={(g) => setEditing({ goal: g })} onDelete={setDeleting} />
          ))
        : open.length > 0 && <GoalList title="In progress" goals={open} onToggle={toggle} onEdit={(g) => setEditing({ goal: g })} onDelete={setDeleting} />}
      {reached.length > 0 && <GoalList title="Reached" goals={reached} onToggle={toggle} onEdit={(g) => setEditing({ goal: g })} onDelete={setDeleting} />}

      {editing && <GoalSheet goal={editing.goal} onClose={() => setEditing(null)} onSaved={(g) => { put(g); onChanged(); }} />}
      {deleting && (
        <ConfirmDialog title={`Delete “${deleting.title}”?`} body="Its tasks stay; they are only unlinked from this goal." confirmLabel="Delete" danger
          onClose={() => setDeleting(null)}
          onConfirm={async () => { await goalsApi.remove(deleting.id); setGoals((l) => (l ?? []).filter((x) => x.id !== deleting.id)); onChanged(); }} />
      )}
    </div>
  );
}

function GoalList({ title, goals, onToggle, onEdit, onDelete }: { title: string; goals: Goal[]; onToggle: (g: Goal) => void; onEdit: (g: Goal) => void; onDelete: (g: Goal) => void }) {
  return (
    <section>
      <h2 className="mb-3 text-lg font-medium text-ink">{title} <span className="text-sm font-normal text-ink-faint">{goals.length}</span></h2>
      <ul className="flex flex-col gap-3">
        {goals.map((g) => <GoalCard key={g.id} goal={g} onToggle={() => onToggle(g)} onEdit={() => onEdit(g)} onDelete={() => onDelete(g)} />)}
      </ul>
    </section>
  );
}

/** One goal: a round tick (reached), its name, horizon and deadline, and its tasks' progress. */
function GoalCard({ goal: g, onToggle, onEdit, onDelete }: { goal: Goal; onToggle: () => void; onEdit: () => void; onDelete: () => void }) {
  const [report, setReport] = useState(false);
  const done = g.status === "done";
  const d = deadlineLabel(g);
  const { total, done: finished } = g.tasks;
  const pct = total ? Math.round((finished / total) * 100) : 0;
  return (
    <li className="pw-card flex items-start gap-3 rounded-[28px] bg-canvas-raised p-4 md:rounded-none md:border md:border-overlay/10">
      <button type="button" onClick={onToggle} aria-pressed={done} aria-label={done ? `Mark “${g.title}” as not reached` : `Mark “${g.title}” as reached`}
        className={cn("mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full border-2 transition-colors", done ? "border-accent-medium bg-accent-medium text-white" : "border-overlay/30")}>
        {done && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
      </button>
      <div className="min-w-0 flex-1">
        <p className={cn("break-words text-[17px] leading-snug", done ? "text-ink-faint line-through" : "text-ink")}>{g.title}</p>
        <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px]">
          <Badge tone="blue" className="rounded-full">{periodLabel(g.period)}</Badge>
          <span className="whitespace-nowrap text-ink-muted" title={longDay(g.dueDay)}>Due {shortDay(g.dueDay)} · <span className={cn("font-medium", TONE[d.tone])}>{d.text}</span></span>
        </p>
        {g.notes && <p className="mt-1.5 line-clamp-2 text-sm text-ink-muted">{g.notes}</p>}
        {/* Reached: the record, like a project tracker's (when, against the deadline, how long, tasks and time). */}
        {done && <CompletedSummary goal={g} />}
        <div className={cn("mt-3", done && "hidden")}>
          <div className="mb-1 flex justify-between text-xs text-ink-muted">
            <span className="flex items-center gap-1"><Target className="h-3 w-3" aria-hidden />{total ? `${finished} of ${total} task${total === 1 ? "" : "s"} done` : "No tasks linked yet"}</span>
            {total > 0 && <span className="tabular-nums">{pct}%</span>}
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-overlay/10">
            <div className={cn("h-full rounded-full transition-[width] duration-500", done || pct === 100 ? "bg-accent-medium" : "bg-[#3478F6]")} style={{ width: `${done ? 100 : pct}%` }} />
          </div>
        </div>
        <button type="button" onClick={() => setReport(true)} className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-overlay/[0.06] px-3 py-1.5 text-[13px] font-medium text-ink transition-colors active:bg-overlay/[0.12]">
          <BarChart3 className="h-3.5 w-3.5 text-[#3478F6]" aria-hidden />View report<ChevronRight className="h-3.5 w-3.5 text-ink-faint" aria-hidden />
        </button>
      </div>
      <GoalMenu title={g.title} done={done} onToggle={onToggle} onEdit={onEdit} onDelete={onDelete} onReport={() => setReport(true)} />
      {report && <GoalReportSheet goalId={g.id} title={g.title} onClose={() => setReport(false)} />}
    </li>
  );
}

/** Against the deadline: "On the deadline", "3 days early", "2 days late". */
const scheduleText = (completed: string, due: string) => {
  const n = span(completed, due);
  return n === 0 ? "On the deadline" : n > 0 ? `${n} day${n === 1 ? "" : "s"} early` : `${-n} day${n === -1 ? "" : "s"} late`;
};
const daysText = (n: number) => `${n} day${n === 1 ? "" : "s"}`;
/** Logged against planned: "45m over plan", "1 h under plan", "On plan". */
const varianceText = (logged: number, planned: number) => {
  if (!planned) return logged ? "No time was planned" : "—";
  const d = logged - planned;
  return d === 0 ? "On plan" : `${duration(Math.abs(d))} ${d > 0 ? "over" : "under"} plan`;
};

/** A reached goal's record on its card. */
function CompletedSummary({ goal: g }: { goal: Goal }) {
  const completed = g.completedDay ?? today();
  const late = span(completed, g.dueDay) < 0;
  const t = g.time ?? { plannedMinutes: 0, loggedMinutes: 0 };
  return (
    <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2.5 rounded-2xl bg-overlay/[0.04] p-3.5 text-[13px]">
      <div><dt className="text-ink-faint">Completed</dt><dd className="mt-0.5 font-medium text-ink">{shortDay(completed)}</dd></div>
      <div><dt className="text-ink-faint">Against deadline</dt><dd className={cn("mt-0.5 font-medium", late ? "text-accent-extreme" : "text-accent-medium")}>{scheduleText(completed, g.dueDay)}</dd></div>
      <div><dt className="text-ink-faint">Took</dt><dd className="mt-0.5 font-medium text-ink">{daysText(span(g.startDay, completed) + 1)}</dd></div>
      <div><dt className="text-ink-faint">Tasks</dt><dd className="mt-0.5 font-medium text-ink">{g.tasks.total ? `${g.tasks.done} of ${g.tasks.total} done` : "None linked"}</dd></div>
      <div className="col-span-2"><dt className="text-ink-faint">Time</dt><dd className="mt-0.5 font-medium text-ink">{duration(t.loggedMinutes)} logged{t.plannedMinutes ? ` of ${duration(t.plannedMinutes)} planned` : ""}</dd></div>
    </dl>
  );
}

/**
 * A goal's report, like a project tracker: status, the key dates (started, deadline, completed), how long it took and
 * how it went against the deadline; time logged against time planned; every linked task with its own planned and
 * logged time; and the work logged on them.
 */
export function GoalReportSheet({ goalId, title, onClose }: { goalId: string; title: string; onClose: () => void }) {
  return (
    <SettingsSheet label="Goal report" onClose={onClose}>
      <GoalReportView goalId={goalId} title={title} />
    </SettingsSheet>
  );
}

/** The report itself (in the sheet above, or inline on the Goal review page). `onLoaded` gets it once loaded (to share it). */
export function GoalReportView({ goalId, title, onLoaded }: { goalId: string; title: string; onLoaded?: (r: GoalReport) => void }) {
  const [r, setR] = useState<GoalReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    setR(null);
    goalsApi.report(goalId).then((x) => { setR(x); onLoaded?.(x); }, (e) => setError(e instanceof Error ? e.message : "Could not load the report."));
  }, [goalId]); // eslint-disable-line react-hooks/exhaustive-deps
  const now = today();
  return (
    <>
      {error ? <p className="px-4 text-sm text-accent-extreme" role="alert">{error}</p> : !r ? <PanelLoader label="Loading the report" /> : (() => {
        const g = r.goal;
        const done = g.status === "done";
        const end = done ? (g.completedDay ?? now) : now;
        const t = g.time ?? { plannedMinutes: 0, loggedMinutes: 0 };
        const pct = g.tasks.total ? Math.round((g.tasks.done / g.tasks.total) * 100) : 0;
        const late = span(end, g.dueDay) < 0;
        const status = done ? (late ? "Reached late" : "Reached") : late ? "Overdue" : "In progress";
        const tone = done ? (late ? "bg-accent-fast/15 text-accent-fast" : "bg-accent-medium/15 text-accent-medium") : late ? "bg-accent-extreme/15 text-accent-extreme" : "bg-[#3478F6]/12 text-[#3478F6]";
        const timePct = t.plannedMinutes ? Math.min(100, Math.round((t.loggedMinutes / t.plannedMinutes) * 100)) : t.loggedMinutes ? 100 : 0;
        const fact = (label: string, value: React.ReactNode, cls = "text-ink") => (
          <div className="px-4 py-3"><dt className="text-[12px] uppercase tracking-wide text-ink-faint">{label}</dt><dd className={cn("mt-0.5 text-[16px] font-medium", cls)}>{value}</dd></div>
        );
        return (
          <div className="flex flex-col">
            <div className="mb-6 px-1">
              <p className="break-words text-[22px] font-semibold leading-tight tracking-[-0.01em] text-ink">{title}</p>
              <p className="mt-2 flex flex-wrap items-center gap-2 text-[13px]">
                <span className={cn("rounded-full px-2.5 py-0.5 font-semibold", tone)}>{status}</span>
                <span className="rounded-full bg-overlay/[0.07] px-2.5 py-0.5 font-medium text-ink-muted">{periodLabel(g.period)}</span>
              </p>
              {g.notes && <p className="mt-3 whitespace-pre-wrap text-[14px] text-ink-muted">{g.notes}</p>}
              {g.review && <p className="mt-2 whitespace-pre-wrap break-words rounded-xl bg-overlay/[0.04] px-3 py-2 text-[14px] text-ink"><span className="font-medium">Review. </span>{g.review}</p>}
            </div>

            <Section title="Overview">
              <dl className="pw-group grid grid-cols-2 divide-overlay/10 overflow-hidden rounded-[14px] [&>div:nth-child(even)]:border-l [&>div:nth-child(even)]:border-overlay/10 [&>div:nth-child(n+3)]:border-t [&>div:nth-child(n+3)]:border-overlay/10">
                {fact("Started", shortDay(g.startDay))}
                {fact("Deadline", shortDay(g.dueDay))}
                {fact(done ? "Completed" : "Today", shortDay(end))}
                {fact(done ? "Against deadline" : "Schedule", done ? scheduleText(end, g.dueDay) : deadlineLabel(g).text, late ? "text-accent-extreme" : done ? "text-accent-medium" : "text-ink")}
                {fact(done ? "Took" : "Running for", daysText(span(g.startDay, end) + 1))}
                {fact("Last activity", r.lastActivityDay ? shortDay(r.lastActivityDay) : "—")}
              </dl>
            </Section>

            <Section title="Progress">
              <div className="pw-group rounded-[14px] p-4">
                <div className="mb-1.5 flex justify-between text-[14px]"><span className="text-ink">Tasks</span><span className="tabular-nums text-ink-muted">{g.tasks.done} of {g.tasks.total} · {pct}%</span></div>
                <div className="h-2 overflow-hidden rounded-full bg-overlay/10"><div className="h-full rounded-full bg-accent-medium transition-[width] duration-500" style={{ width: `${pct}%` }} /></div>
                <div className="mb-1.5 mt-4 flex justify-between text-[14px]"><span className="text-ink">Time logged</span><span className="tabular-nums text-ink-muted">{duration(t.loggedMinutes)}{t.plannedMinutes ? ` of ${duration(t.plannedMinutes)} planned` : ""}</span></div>
                <div className="h-2 overflow-hidden rounded-full bg-overlay/10"><div className={cn("h-full rounded-full transition-[width] duration-500", t.loggedMinutes > t.plannedMinutes && t.plannedMinutes ? "bg-accent-fast" : "bg-[#3478F6]")} style={{ width: `${timePct}%` }} /></div>
                <p className="mt-2 text-[13px] text-ink-muted">{varianceText(t.loggedMinutes, t.plannedMinutes)}</p>
              </div>
            </Section>

            {/* Shown only when there is something in them. */}
            {r.tasks.length > 0 && <Section title={`Tasks · ${r.tasks.length}`}>
              {(
                <ul className="pw-group overflow-hidden rounded-[14px]">
                  {r.tasks.map((x, i) => (
                    <li key={x.id} className={cn("flex items-start gap-3 px-4 py-3", i > 0 && "border-t border-overlay/10")}>
                      <span className={cn("mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full", x.status === "done" ? "bg-accent-medium text-white" : "border-2 border-overlay/25")}>{x.status === "done" && <Check className="h-3 w-3" strokeWidth={3} />}</span>
                      <span className="min-w-0 flex-1">
                        <span className={cn("block truncate text-[15px]", x.status === "done" ? "text-ink-muted" : "text-ink")}>{x.title}</span>
                        <span className="block text-[12px] text-ink-faint">{x.completedDay ? `Finished ${shortDay(x.completedDay)}` : `Planned ${shortDay(x.startDay)}${x.dueDay !== x.startDay ? ` – ${shortDay(x.dueDay)}` : ""}`}</span>
                      </span>
                      <span className="shrink-0 text-right text-[13px] tabular-nums text-ink-muted">
                        <span className="block text-ink">{duration(x.loggedMinutes)}</span>
                        {x.plannedMinutes > 0 && <span className="block text-[11px] text-ink-faint">of {duration(x.plannedMinutes)}</span>}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Section>}

            {r.logs.length > 0 && <Section title="Work log">
              {(
                <ul className="pw-group overflow-hidden rounded-[14px]">
                  {r.logs.slice(0, 50).map((l, i) => (
                    <li key={l.id} className={cn("flex items-start gap-3 px-4 py-3", i > 0 && "border-t border-overlay/10")}>
                      <Clock className="mt-0.5 h-4 w-4 shrink-0 text-ink-faint" aria-hidden />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[15px] text-ink">{l.taskTitle}</span>
                        <span className="block truncate text-[12px] text-ink-faint">{shortDay(l.day)}{l.note ? ` · ${l.note}` : ""}</span>
                      </span>
                      <span className="shrink-0 text-[13px] font-medium tabular-nums text-ink">{duration(l.minutes)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Section>}
          </div>
        );
      })()}
    </>
  );
}

function GoalMenu({ title, done, onToggle, onEdit, onDelete, onReport }: { title: string; done: boolean; onToggle: () => void; onEdit: () => void; onDelete: () => void; onReport: () => void }) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  return (
    <>
      <button ref={trigger} type="button" onClick={() => setOpen((o) => !o)} aria-haspopup="listbox" aria-expanded={open} aria-label={`${title}: actions`}
        className="pw-circle-btn grid h-9 w-9 shrink-0 place-items-center rounded-full text-ink active:scale-95">
        <MoreHorizontal className="h-4 w-4" />
      </button>
      {open && (
        <DropdownMenu soft anchor={trigger} label="Goal actions" value="" minWidth={200}
          ghost={<span className="pw-circle-btn grid h-full w-full place-items-center rounded-full text-ink"><MoreHorizontal className="h-4 w-4" /></span>} onClose={() => setOpen(false)}
          groups={[{ title: "", items: [
            { id: "toggle", label: done ? "Not reached yet" : "Mark as reached", icon: done ? RotateCcw : Check },
            { id: "report", label: "Report", icon: BarChart3 },
            { id: "edit", label: "Edit", icon: Pencil },
            { id: "delete", label: "Delete", icon: Trash2, danger: true },
          ] }]}
          onSelect={(id) => (id === "toggle" ? onToggle() : id === "report" ? onReport() : id === "edit" ? onEdit() : onDelete())} />
      )}
    </>
  );
}

/** New goal or edit one: name, horizon (the deadline follows it: the end of this week, month, quarter or year), deadline, notes. */
export function GoalSheet({ goal, onClose, onSaved }: { goal?: Goal; onClose: () => void; onSaved: (g: Goal) => void }) {
  const now = today();
  const [title, setTitle] = useState(goal?.title ?? "");
  const [period, setPeriod] = useState<GoalPeriod>(goal?.period ?? "week");
  const [dueDay, setDueDay] = useState(goal?.dueDay ?? periodEnd("week", now));
  const [notes, setNotes] = useState(goal?.notes ?? "");
  const [review, setReview] = useState(goal?.review ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pick = (p: GoalPeriod) => { setPeriod(p); setDueDay(periodEnd(p, now)); };

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (!title.trim()) { setError("Give the goal a name."); return; }
    if (dueDay < now && dueDay !== goal?.dueDay) { setError("The deadline cannot be in the past."); return; }
    setBusy(true);
    setError(null);
    const input: GoalInput = { title: title.trim(), notes: notes.trim(), review: review.trim(), period, dueDay };
    try { onSaved(goal ? await goalsApi.update(goal.id, input) : await goalsApi.create(input)); onClose(); } catch (err) { setError(err instanceof Error ? err.message : "Could not save the goal."); setBusy(false); }
  }

  return (
    <SettingsSheet label={goal ? "Edit goal" : "New goal"} onClose={onClose}>
      <form onSubmit={(e) => void submit(e)} className="flex flex-col">
        <Section title="Goal">
          <div className="pw-group rounded-[14px] px-4">
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Finish the physics syllabus" maxLength={120} autoFocus aria-label="Goal" className={cn(ROW_INPUT, "min-h-[46px] py-2.5")} />
          </div>
        </Section>
        <Section title="Horizon" note={PERIODS.find((p) => p.id === period)?.hint}>
          <Segmented soft label="Horizon" value={period} options={PERIODS.map((p) => ({ id: p.id, label: p.short, hint: p.hint }))} onChange={pick} />
        </Section>
        <Section title="Deadline" note={`${longDay(dueDay)}. Change it if you need another day.`}>
          <div className="pw-group overflow-hidden rounded-[14px]">
            <label className={ROW}>
              <span className="shrink-0 text-[17px] text-ink">Due</span>
              <input type="date" value={dueDay} min={now} max={addDays(now, period === "long" ? 3650 : 395)} onChange={(e) => e.target.value && setDueDay(e.target.value)} className={cn(ROW_INPUT, "text-right tabular-nums")} />
            </label>
          </div>
        </Section>
        <Section title="Notes" note="Optional: why it matters, or how you will get there.">
          <div className="pw-group rounded-[14px] px-4 py-2.5">
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} maxLength={2000} aria-label="Notes" className={cn(ROW_INPUT, "resize-none")} />
          </div>
        </Section>
        <Section title="Review" note="Optional: what went well, mistakes, failures, and what you'd do differently. Shown in Goal review.">
          <div className="pw-group rounded-[14px] px-4 py-2.5">
            <textarea value={review} onChange={(e) => setReview(e.target.value)} rows={3} maxLength={2000} aria-label="Review" placeholder="e.g. Started late; daily 1 h blocks worked best." className={cn(ROW_INPUT, "resize-none")} />
          </div>
        </Section>
        {error && <p className="-mt-3 mb-5 px-4 text-[15px] text-accent-extreme" role="alert">{error}</p>}
        <div className="flex gap-3">
          <button type="button" onClick={onClose} disabled={busy} className="h-12 flex-1 rounded-full bg-overlay/[0.08] text-[17px] font-medium text-ink transition-transform active:scale-[0.98] disabled:opacity-40">Cancel</button>
          <button type="submit" disabled={busy || !title.trim()}
            className="inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-full bg-[#3478F6] text-[17px] font-semibold text-white transition-transform active:scale-[0.98] disabled:opacity-40">
            {busy ? <ButtonWheel /> : goal ? <Check className="h-[18px] w-[18px]" strokeWidth={2.5} /> : <Plus className="h-[18px] w-[18px]" strokeWidth={2.5} />}{busy ? "Saving…" : goal ? "Save" : "Add goal"}
          </button>
        </div>
      </form>
    </SettingsSheet>
  );
}
