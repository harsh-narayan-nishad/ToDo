"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import LiquidGlass from "@/components/LiquidGlass";
import { TaskPlanner } from "@/components/TaskPlanner";
import { TaskHabits } from "@/components/TaskHabits";
import { TaskOverview } from "@/components/TaskOverview";
import { weekday } from "@/lib/repeat";
import { PanelLoader } from "@/components/WheelSpinner";
import { BarChart3, CalendarDays, Check, Clock, Lock, MoreHorizontal, Pencil, Plus, Timer, Trash2 } from "lucide-react";
import { Badge, Button, ConfirmDialog, Empty, Pager } from "@/components/ui";
import { EditTaskDialog, LogTimeDialog } from "@/components/TaskDialogs";
import { lateFinishAllowed, lockedProblem } from "@/lib/rules";
import { addDays, clock, duration, rangeLabel, today, whenLabel } from "@/lib/days";
import { DropdownMenu, GlassDropdown } from "@/components/GlassDropdown";
import { taskCounts } from "@/components/CountCards";
import { changeEvent, loadEvents, type CalendarItem } from "@/lib/calendar/events";
import { todoApi, type Priority, type Task } from "@/lib/todo";
import { cn } from "@/lib/utils";

type Filter = "open" | "done" | "all";
const PRIORITY_TONE = { high: "red", medium: "amber", low: "blue" } as const;
const UP_PAGE = 10;
const RANK: Record<Priority, number> = { high: 0, medium: 1, low: 2 };

/** `neet` = the signed-in user is preparing for NEET: task titles then also search the NEET syllabus and NCERT chapters. */
export function TasksPanel({ onChanged, refreshKey = 0, onOpenHabits, neet = false, onDueNow, onOpenCalendar }: { onChanged: () => void; refreshKey?: number; onOpenHabits?: () => void; neet?: boolean; onDueNow?: (n: number) => void; onOpenCalendar?: () => void }) {
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("open");
  const [editing, setEditing] = useState<Task | null>(null);
  const [logging, setLogging] = useState<Task | null>(null);
  const [deleting, setDeleting] = useState<Task | null>(null);
  const [planning, setPlanning] = useState(false);
  const [overview, setOverview] = useState(false);

  /**
   * Today's own calendar events (added in the Calendar or in Pacewise, not To-do tasks): shown here too, so everything
   * planned for today is on the home screen. To-do's own copies ("todo-…", "todolog-…") are left out (they are the tasks).
   */
  const [calToday, setCalToday] = useState<CalendarItem[]>([]);
  const load = useCallback(async () => {
    void loadEvents("").then((all) => {
      const start = new Date(); start.setHours(0, 0, 0, 0);
      const end = new Date(start); end.setDate(end.getDate() + 1);
      setCalToday(all
        .filter((e) => !e.id.startsWith("todo-") && !e.id.startsWith("todolog-") && new Date(e.start) < end && new Date(e.end) > start)
        .sort((a, b) => Number(b.allDay) - Number(a.allDay) || a.start.localeCompare(b.start)));
    }, () => undefined);
    try { setTasks(await todoApi.tasks()); setError(null); } catch (e) { setError(e instanceof Error ? e.message : "Could not load tasks."); }
  }, []);
  useEffect(() => { void load(); }, [load, refreshKey]);
  // The tour's practice task lives on this screen only: when the tour ends, it goes.
  useEffect(() => {
    const drop = () => setTasks((list) => (list ? list.filter((t) => !t.id.startsWith("tour-")) : list));
    window.addEventListener("pw-tour-end", drop);
    return () => window.removeEventListener("pw-tour-end", drop);
  }, []);

  const replace = (t: Task) => setTasks((list) => (list ?? []).map((x) => (x.id === t.id ? { ...x, ...t } : x)));

  /** Tasks just ticked done: shown checked and sliding away for a moment before they move to Done. */
  const [celebrating, setCelebrating] = useState<Set<string>>(new Set());
  async function toggle(t: Task) {
    const status = t.status === "done" ? "open" : "done";
    if (status === "done") {
      if (celebrating.has(t.id)) return;
      setCelebrating((s) => new Set(s).add(t.id));
      try { navigator.vibrate?.(12); } catch { /* not supported */ }
      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      // The tour's practice task (made on this screen only): ticking it off just removes it.
      const practice = t.id.startsWith("tour-");
      try {
        const wait = new Promise((r) => setTimeout(r, reduced ? 200 : 750));
        if (practice) {
          await wait;
          setTasks((list) => (list ?? []).filter((x) => x.id !== t.id));
        } else {
          const [saved] = await Promise.all([todoApi.update(t.id, { status }), wait]);
          replace(saved);
        }
        onChanged();
      } catch (e) { setError(e instanceof Error ? e.message : "Could not update."); }
      finally { setCelebrating((s) => { const n = new Set(s); n.delete(t.id); return n; }); }
      return;
    }
    replace({ ...t, status });
    try { replace(await todoApi.update(t.id, { status })); onChanged(); } catch (e) { replace(t); setError(e instanceof Error ? e.message : "Could not update."); }
  }

  const now = today();
  /** Every group is paged (10 a page): a plan can add many tasks. Back to page 1 when the filter changes. */
  const [pages, setPages] = useState<Record<string, number>>({});
  useEffect(() => setPages({}), [filter]);
  const groups = useMemo(() => {
    const list = (tasks ?? []).filter((t) => filter === "all" || t.status === filter);
    const sort = (a: Task, b: Task) => a.dueDay.localeCompare(b.dueDay) || RANK[a.priority] - RANK[b.priority];
    const open = list.filter((t) => t.status === "open").sort(sort);
    return [
      { key: "overdue", title: "Overdue", items: open.filter((t) => t.dueDay < now) },
      { key: "today", title: "Today", items: open.filter((t) => t.startDay <= now && t.dueDay >= now) },
      // Upcoming only under All, so To do stays about what is due now.
      { key: "upcoming", title: "Upcoming", items: filter === "all" ? open.filter((t) => t.startDay > now) : [] },
      { key: "done", title: "Done", items: list.filter((t) => t.status === "done").sort((a, b) => (b.completedDay ?? "").localeCompare(a.completedDay ?? "")) },
    ].filter((g) => g.items.length > 0);
  }, [tasks, filter, now]);

  const upcomingCount = (tasks ?? []).filter((t) => t.status === "open" && t.startDay > now).length;
  /** A group's current page, kept in range when tasks are added or removed. */
  const page = (key: string, n: number) => Math.min(pages[key] ?? 1, Math.max(1, Math.ceil(n / UP_PAGE)));
  /** Upcoming tasks that start by the end of this week (Sunday). */
  const weekEnd = addDays(now, 6 - weekday(now));
  const upcomingThisWeek = (tasks ?? []).filter((t) => t.status === "open" && t.startDay > now && t.startDay <= weekEnd).length;

  /** For the phone greeting ("You have work today"). */
  const counts = useMemo(() => taskCounts(tasks ?? [], now), [tasks, now]);
  /** A calendar event ticked off here is marked done in the calendar itself ("✓ " title, outline style), like a finished task. */
  const evDone = (e: CalendarItem) => e.title.startsWith("✓ ");
  const [calCelebrating, setCalCelebrating] = useState<Set<string>>(new Set());
  useEffect(() => { if (tasks) onDueNow?.(counts.today + counts.overdue + calToday.filter((e) => !evDone(e)).length); }, [tasks, counts, calToday, onDueNow]);
  async function toggleEvent(e: CalendarItem) {
    const finishing = !evDone(e);
    const next: CalendarItem = finishing ? { ...e, title: `✓ ${e.title}`, variant: "outline" } : { ...e, title: e.title.replace(/^✓ /, ""), variant: "primary" };
    try {
      if (finishing) {
        if (calCelebrating.has(e.id)) return;
        setCalCelebrating((s) => new Set(s).add(e.id));
        try { navigator.vibrate?.(12); } catch { /* not supported */ }
        const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        await Promise.all([changeEvent("", e.id, { title: next.title, variant: next.variant }), new Promise((r) => setTimeout(r, reduced ? 200 : 750))]);
      } else {
        await changeEvent("", e.id, { title: next.title, variant: next.variant });
      }
      setCalToday((list) => list.map((x) => (x.id === e.id ? next : x)));
      onChanged();
    } catch (err) { setError(err instanceof Error ? err.message : "Could not update."); }
    finally { setCalCelebrating((s) => { if (!s.has(e.id)) return s; const n = new Set(s); n.delete(e.id); return n; }); }
  }
  /** Today's calendar events: open ones under To do, ticked-off ones under Done, all under All. */
  const calShown = calToday.filter((e) => filter === "all" || (filter === "done" ? evDone(e) : !evDone(e) || calCelebrating.has(e.id)));
  const showCal = calShown.length > 0;
  const calSection = showCal ? <CalendarToday key="calendar" events={calShown} onOpen={onOpenCalendar} onToggle={(e) => void toggleEvent(e)} celebrating={calCelebrating} /> : null;

  const habitsSection = <TaskHabits key="habits" refreshKey={refreshKey} onlyDone={filter === "done"} onChanged={onChanged} onOpenHabits={onOpenHabits} />;

  return (
    <div className="flex flex-col gap-8 pb-40">
      {/* Phones: To do / Done / All and Overview in one dropdown. */}
      <div className="flex items-center gap-3 md:hidden">
        <GlassDropdown soft label="Show" className="w-32" value={filter} display={filter === "open" ? "To do" : filter === "done" ? "Done" : "All"}
          groups={[
            { title: "Show", items: [
              { id: "open", label: "To do", meta: tasks ? String(tasks.filter((t) => t.status === "open").length) : undefined },
              { id: "done", label: "Done", meta: tasks ? String(tasks.filter((t) => t.status === "done").length) : undefined },
              { id: "all", label: "All", meta: tasks ? String(tasks.length) : undefined },
            ] },
            ...(tasks ? [{ title: "", items: [{ id: "overview", label: "Overview" }] }] : []),
          ]}
          onSelect={(id) => (id === "overview" ? setOverview(true) : setFilter(id as Filter))} />
      </div>
      <div className="hidden flex-wrap items-center gap-2 md:flex">
        {(["open", "done", "all"] as Filter[]).map((f) => (
          <Button key={f} size="sm" variant={filter === f ? "primary" : "outline"} onClick={() => setFilter(f)}>{f === "open" ? "To do" : f === "done" ? "Done" : "All"}</Button>
        ))}
        {tasks && <Button size="sm" variant="outline" onClick={() => setOverview(true)}><BarChart3 className="h-4 w-4" />Overview</Button>}
      </div>

      {error && <p className="text-sm text-accent-extreme" role="alert">{error}</p>}
      {tasks === null && !error && <PanelLoader label="Loading tasks" />}
      {tasks !== null && groups.length === 0 && !showCal && <Empty>{filter === "done" ? "Nothing finished yet." : filter === "open" && upcomingCount > 0 ? `Nothing due today. ${upcomingCount} upcoming task${upcomingCount === 1 ? " is" : "s are"} under All.` : "No tasks yet. Tap + to add one. It also appears in your Pacewise calendar."}</Empty>}

      {groups.flatMap((g, i) => [
        // Today's habits sit right after the tasks for now (Overdue, Today), before Upcoming and Done.
        ...((g.key === "upcoming" || g.key === "done") && (i === 0 || groups[i - 1].key === "overdue" || groups[i - 1].key === "today") ? [calSection, habitsSection] : []),
        <section key={g.key}>
          <h2 className={cn("mb-3 text-sm uppercase tracking-wide", g.key === "overdue" ? "text-accent-extreme" : "text-ink-muted")}>
            {/* Phones: "Today's Task" style headings. */}
            <span className={cn("text-lg font-medium normal-case tracking-normal md:hidden", g.key !== "overdue" && "text-ink")}>{g.key === "today" ? "Today’s Task" : g.title} <span className="text-sm font-normal text-ink-faint">{g.items.length}</span></span>
            <span className="hidden md:inline">{g.key === "upcoming" ? `Upcoming · ${upcomingThisWeek} this week · ${g.items.length} in all` : `${g.title} · ${g.items.length}`}</span>
          </h2>
          <ul className="flex flex-col gap-3 md:gap-0 md:divide-y md:divide-overlay/10 md:border md:border-overlay/10 md:bg-canvas-raised">
            {g.items.slice((page(g.key, g.items.length) - 1) * UP_PAGE, page(g.key, g.items.length) * UP_PAGE).map((t) => (
              <TaskRow key={t.id} task={t} celebrating={celebrating.has(t.id)} onToggle={() => void toggle(t)} onEdit={() => setEditing(t)} onLog={() => setLogging(t)} onDelete={() => setDeleting(t)} />
            ))}
          </ul>
          {g.items.length > UP_PAGE && <div className="mt-3"><Pager page={page(g.key, g.items.length)} total={g.items.length} limit={UP_PAGE} onPage={(n) => setPages((cur) => ({ ...cur, [g.key]: n }))} /></div>}
        </section>,
      ])}
      {tasks !== null && !groups.some((g) => g.key === "upcoming" || g.key === "done") && calSection}
      {tasks !== null && !groups.some((g) => g.key === "upcoming" || g.key === "done") && habitsSection}

      {overview && <TaskOverview tasks={tasks ?? []} onClose={() => setOverview(false)} />}
      {/* + opens the task planner: every task is added there (one task or many, over one day or many). */}
      <AddButton onClick={() => setPlanning(true)} />
      {planning && <TaskPlanner neet={neet} onClose={() => setPlanning(false)} onCreated={(list) => { setTasks((cur) => [...list, ...(cur ?? [])]); onChanged(); }} />}

      {editing && <EditTaskDialog task={editing} onClose={() => setEditing(null)} onSaved={(t) => { replace(t); onChanged(); }} />}
      {logging && (
        <LogTimeDialog task={logging} onClose={() => setLogging(null)} onLogged={(m) => { replace({ ...logging, loggedMinutes: (logging.loggedMinutes ?? 0) + m }); onChanged(); }} />
      )}
      {deleting && (
        <ConfirmDialog
          title="Delete task?"
          body={`“${deleting.title}” is removed from your list and from your Pacewise calendar, including its work blocks. The hours you logged stay in your history.`}
          confirmLabel="Delete"
          danger
          onClose={() => setDeleting(null)}
          onConfirm={async () => {
            await todoApi.remove(deleting.id);
            setTasks((list) => (list ?? []).filter((x) => x.id !== deleting.id));
            onChanged();
          }}
        />
      )}
    </div>
  );
}

function TaskRow({ task: t, celebrating = false, onToggle, onEdit, onLog, onDelete }: { task: Task; celebrating?: boolean; onToggle: () => void; onEdit: () => void; onLog: () => void; onDelete: () => void }) {
  const done = t.status === "done" || celebrating;
  /** Past days are read-only: no ticking, logging, editing or deleting. */
  const locked = lockedProblem(t, today());
  /** Overdue since yesterday: still can be ticked done today (only that). */
  const lateOk = !celebrating && lateFinishAllowed(t, today());
  const tickTitle = lateOk ? "Overdue since yesterday: you can still tick it done today" : (locked ?? undefined);
  return (
    <li data-task-title={t.title} data-task-id={t.id} className={cn(celebrating && "task-done-out")}>
      {/* Phones: a rounded card with a round check, the day and time on top, and a ⋯ menu. */}
      <div className="pw-card flex items-start gap-3 rounded-[28px] bg-canvas-raised p-3 pr-3.5 md:hidden">
        <button onClick={onToggle} disabled={!!locked && !lateOk && !celebrating} title={tickTitle} aria-label={done ? "Mark as not done" : "Mark as done"}
          className={cn("ml-1.5 mt-2.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-[6px] border transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-50", done ? "border-ink bg-ink text-canvas" : "border-overlay/30", celebrating && "check-burst")}>
          {done && <Check className={cn("h-3.5 w-3.5", celebrating && "check-pop")} strokeWidth={3} />}
        </button>
        <div className="min-w-0 flex-1 pt-2">
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-ink-muted">
            <span className="flex items-center gap-1"><CalendarDays className="h-3.5 w-3.5" aria-hidden />{rangeLabel(t.startDay, t.dueDay)}</span>
            {t.startTime && <span className="flex items-center gap-1"><Timer className="h-3.5 w-3.5" aria-hidden />{clock(t.startTime)}{planned(t) ? ` · ${duration(planned(t)!)}` : ""}</span>}
          </p>
          <p className={cn("mt-1 break-words text-[17px] leading-snug", done ? "text-ink-faint line-through" : "text-ink")}>{t.title}</p>
          {t.notes && <p className="mt-1 line-clamp-2 text-sm text-ink-muted">{t.notes}</p>}
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-ink-faint">
            <Badge tone={PRIORITY_TONE[t.priority]} className="rounded-full">{t.priority}</Badge>
            {(t.loggedMinutes ?? 0) > 0 && <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{duration(t.loggedMinutes ?? 0)}</span>}
            {done && t.completedDay && <span>finished {rangeLabel(t.completedDay, t.completedDay).toLowerCase()}</span>}
            {locked && (lateOk ? <span className="text-accent-fast" title={tickTitle}>last day to tick off</span> : <span className="flex items-center gap-1" title={locked}><Lock className="h-3 w-3" />locked</span>)}
          </div>
        </div>
        {!locked && <MoreMenu onLog={onLog} onEdit={onEdit} onDelete={onDelete} />}
      </div>

      <div className="hidden items-start gap-4 px-4 py-4 sm:px-5 md:flex">
      <button onClick={onToggle} disabled={!!locked && !lateOk && !celebrating} title={tickTitle} aria-label={done ? "Mark as not done" : "Mark as done"}
        className={cn("mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-[6px] border transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-50", done ? "border-ink bg-ink text-canvas" : "border-overlay/30")}>
        {done && <Check className={cn("h-3.5 w-3.5", celebrating && "check-pop")} strokeWidth={3} />}
      </button>
      <div className="min-w-0 flex-1">
        <p className={cn("break-words", done ? "text-ink-faint line-through" : "text-ink")}>{t.title}</p>
        {t.notes && <p className="mt-1 line-clamp-2 text-sm text-ink-muted">{t.notes}</p>}
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-ink-faint">
          <Badge tone={PRIORITY_TONE[t.priority]}>{t.priority}</Badge>
          <span>{whenLabel(t.startDay, t.dueDay, t.startTime, t.endTime)}</span>
          {(t.loggedMinutes ?? 0) > 0 && <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{duration(t.loggedMinutes ?? 0)}</span>}
          {done && t.completedDay && <span>· finished {rangeLabel(t.completedDay, t.completedDay).toLowerCase()}</span>}
          {locked && (lateOk ? <span className="text-accent-fast" title={tickTitle}>last day to tick off</span> : <span className="flex items-center gap-1" title={locked}><Lock className="h-3 w-3" />locked</span>)}
        </div>
      </div>
      {!locked && <div className="flex shrink-0 items-center gap-1">
        <Button size="sm" variant="ghost" onClick={onLog} aria-label="Log time"><Clock className="h-4 w-4" /><span className="hidden sm:inline">Log time</span></Button>
        <Button size="sm" variant="ghost" onClick={onEdit} aria-label="Edit"><Pencil className="h-4 w-4" /></Button>
        <Button size="sm" variant="ghost" onClick={onDelete} aria-label="Delete"><Trash2 className="h-4 w-4" /></Button>
      </div>}
      </div>
    </li>
  );
}

/** How long a timed task is planned for, in minutes (its start to its end, across days too); null without times. */
function planned(t: Task): number | null {
  if (!t.startTime || !t.endTime) return null;
  const m = (time: string) => { const [h, mm] = time.split(":").map(Number); return h * 60 + mm; };
  const days = Math.round((new Date(t.dueDay + "T12:00").getTime() - new Date(t.startDay + "T12:00").getTime()) / 86_400_000);
  const total = days * 1440 + m(t.endTime) - m(t.startTime);
  return total > 0 ? total : null;
}

/** Today's own calendar events, as cards like the tasks (time and length on top); a tap opens the Calendar. */
function CalendarToday({ events, onOpen, onToggle, celebrating }: { events: CalendarItem[]; onOpen?: () => void; onToggle: (e: CalendarItem) => void; celebrating: Set<string> }) {
  const hhmm = (d: Date) => `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  const when = (e: CalendarItem) => {
    if (e.allDay) return "All day";
    const s = new Date(e.start);
    const mins = Math.round((new Date(e.end).getTime() - s.getTime()) / 60_000);
    return `${clock(hhmm(s))}${mins > 0 ? ` · ${duration(mins)}` : ""}`;
  };
  return (
    <section>
      <h2 className="mb-3 text-sm uppercase tracking-wide text-ink-muted">
        <span className="text-lg font-medium normal-case tracking-normal text-ink md:hidden">From your calendar <span className="text-sm font-normal text-ink-faint">{events.length}</span></span>
        <span className="hidden md:inline">From your calendar · {events.length}</span>
      </h2>
      <ul className="flex flex-col gap-3 md:gap-0 md:divide-y md:divide-overlay/10 md:border md:border-overlay/10 md:bg-canvas-raised">
        {events.map((e) => {
          const party = celebrating.has(e.id);
          const done = e.title.startsWith("✓ ") || party;
          return (
            <li key={e.id} className={cn(party && "task-done-out")}>
              <div className="pw-card flex w-full items-start gap-3 rounded-[28px] bg-canvas-raised p-3 pr-3.5 md:rounded-none md:bg-transparent md:px-5 md:py-4">
                {/* The same tick box as a task: ticking marks the event done in the calendar. */}
                <button type="button" onClick={() => onToggle(e)} aria-label={done ? "Mark as not done" : "Mark as done"}
                  className={cn("ml-1.5 mt-2.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-[6px] border transition-colors duration-150 md:ml-0 md:mt-1", done ? "border-ink bg-ink text-canvas" : "border-overlay/30", party && "check-burst")}>
                  {done && <Check className={cn("h-3.5 w-3.5", party && "check-pop")} strokeWidth={3} />}
                </button>
                <button type="button" onClick={onOpen} className="min-w-0 flex-1 pt-2 text-left md:pt-0">
                  <span className="flex items-center gap-1 text-[13px] text-ink-muted"><Timer className="h-3.5 w-3.5" aria-hidden />{when(e)}</span>
                  <span className={cn("mt-1 block break-words text-[17px] leading-snug md:text-base", done ? "text-ink-faint line-through" : "text-ink")}>{e.title.replace(/^✓ /, "")}</span>
                  <span className="mt-1 flex items-center gap-1 text-xs text-ink-faint"><CalendarDays className="h-3 w-3" aria-hidden />In your calendar · tap to open</span>
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** Phones: the ⋯ on a task card, with Log time, Edit and Delete. */
function MoreMenu({ onLog, onEdit, onDelete }: { onLog: () => void; onEdit: () => void; onDelete: () => void }) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  return (
    <>
      <button ref={trigger} type="button" onClick={() => setOpen((o) => !o)} aria-haspopup="listbox" aria-expanded={open} aria-label="Task actions"
        className="pw-circle-btn mt-1 grid h-9 w-9 shrink-0 place-items-center rounded-full text-ink active:scale-95">
        <MoreHorizontal className="h-4 w-4" />
      </button>
      {open && (
        <DropdownMenu soft anchor={trigger} label="Task actions" value="" minWidth={200}
          ghost={<span className="pw-circle-btn grid h-full w-full place-items-center rounded-full text-ink"><MoreHorizontal className="h-4 w-4" /></span>} onClose={() => setOpen(false)}
          groups={[{ title: "", items: [{ id: "log", label: "Log time", icon: Clock }, { id: "edit", label: "Edit", icon: Pencil }, { id: "delete", label: "Delete", icon: Trash2, danger: true }] }]}
          onSelect={(id) => (id === "log" ? onLog() : id === "edit" ? onEdit() : onDelete())} />
      )}
    </>
  );
}

/** The floating + in liquid glass, bottom right; opens the task planner. */
function AddButton({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" data-tour="add" onClick={onClick} aria-label="Add tasks" title="Add tasks"
      className="glass-fab fixed bottom-[max(1.5rem,env(safe-area-inset-bottom))] max-md:bottom-[calc(5rem+env(safe-area-inset-bottom))] right-5 z-40 grid h-14 w-14 place-items-center rounded-full text-ink max-md:bg-[#3478F6] max-md:text-white max-md:shadow-themed focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-medium sm:right-8 md:bottom-10 md:right-10">
      <span className="absolute inset-0 max-md:hidden" aria-hidden><LiquidGlass width="100%" height="100%" radius={28} blur={4} /></span>
      <Plus className="relative h-6 w-6" strokeWidth={2.25} aria-hidden />
    </button>
  );
}
