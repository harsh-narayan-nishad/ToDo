"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import LiquidGlass from "@/components/LiquidGlass";
import { GlassButton } from "@/components/GlassButton";
import { TaskPlanner } from "@/components/TaskPlanner";
import { TaskHabits } from "@/components/TaskHabits";
import { TaskOverview } from "@/components/TaskOverview";
import { weekday } from "@/lib/repeat";
import { PanelLoader } from "@/components/WheelSpinner";
import { BarChart3, BookOpen, CalendarDays, CalendarRange, Check, Clock, History, Lock, MoreHorizontal, Pencil, Plus, Timer, Trash2, X } from "lucide-react";
import { Badge, Button, ConfirmDialog, Empty, FIELD, LABEL, Pager } from "@/components/ui";
import { EditTaskDialog, LogTimeDialog, TimeFields } from "@/components/TaskDialogs";
import { earliestStart, lockedProblem, planProblem, titleProblem } from "@/lib/rules";
import { addDays, clock, duration, rangeLabel, today, whenLabel } from "@/lib/days";
import { DropdownMenu, GlassDropdown } from "@/components/GlassDropdown";
import { taskCounts } from "@/components/CountCards";
import { loadEvents, type CalendarItem } from "@/lib/calendar/events";
import { todoApi, type Entry, type Priority, type Task } from "@/lib/todo";
import { entryPath, searchEntries, useEntries } from "@/lib/entries";
import { cn } from "@/lib/utils";
import { searchSyllabus, syllabusKey, syllabusNote, syllabusPath, syllabusTitle, type SyllabusItem } from "@/lib/neetSyllabus";
import { ButtonWheel } from "@/components/WheelSpinner";

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
  const [adding, setAdding] = useState(false);
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
      try {
        const [saved] = await Promise.all([todoApi.update(t.id, { status }), new Promise((r) => setTimeout(r, reduced ? 200 : 750))]);
        replace(saved);
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
  useEffect(() => { if (tasks) onDueNow?.(counts.today + counts.overdue + calToday.length); }, [tasks, counts, calToday, onDueNow]);
  /** Today's calendar events, under To do and All (not under Done: they have no done state). */
  const showCal = filter !== "done" && calToday.length > 0;
  const calSection = showCal ? <CalendarToday key="calendar" events={calToday} onOpen={onOpenCalendar} /> : null;

  const habitsSection = <TaskHabits key="habits" refreshKey={refreshKey} onlyDone={filter === "done"} onChanged={onChanged} onOpenHabits={onOpenHabits} />;

  return (
    <div className="flex flex-col gap-8 pb-40">
      {/* Phones: To do / Done / All and Overview in one dropdown. */}
      <div className="flex items-center gap-3 md:hidden">
        <GlassDropdown ios label="Show" className="w-32" value={filter} display={filter === "open" ? "To do" : filter === "done" ? "Done" : "All"}
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
      <PlanButton onClick={() => setPlanning(true)} />
      <AddButton onClick={() => setAdding(true)} />
      {planning && <TaskPlanner neet={neet} onClose={() => setPlanning(false)} onCreated={(list) => { setTasks((cur) => [...list, ...(cur ?? [])]); onChanged(); }} />}
      {adding && <NewTaskSheet neet={neet} tasks={tasks ?? []} onClose={() => setAdding(false)} onCreated={(t) => { setTasks((list) => [t, ...(list ?? [])]); onChanged(); }} />}

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
  return (
    <li className={cn(celebrating && "task-done-out")}>
      {/* Phones: a rounded card with a round check, the day and time on top, and a ⋯ menu. */}
      <div className="ios-card flex items-start gap-3 rounded-[28px] bg-canvas-raised p-3 pr-3.5 md:hidden">
        <button onClick={onToggle} disabled={!!locked} title={locked ?? undefined} aria-label={done ? "Mark as not done" : "Mark as done"}
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
            {locked && <span className="flex items-center gap-1" title={locked}><Lock className="h-3 w-3" />locked</span>}
          </div>
        </div>
        {!locked && <MoreMenu onLog={onLog} onEdit={onEdit} onDelete={onDelete} />}
      </div>

      <div className="hidden items-start gap-4 px-4 py-4 sm:px-5 md:flex">
      <button onClick={onToggle} disabled={!!locked} title={locked ?? undefined} aria-label={done ? "Mark as not done" : "Mark as done"}
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
          {locked && <span className="flex items-center gap-1" title={locked}><Lock className="h-3 w-3" />locked</span>}
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
function CalendarToday({ events, onOpen }: { events: CalendarItem[]; onOpen?: () => void }) {
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
        {events.map((e) => (
          <li key={e.id}>
            <button type="button" onClick={onOpen} className="ios-card flex w-full items-start gap-3 rounded-[28px] bg-canvas-raised p-3 pr-3.5 text-left md:rounded-none md:bg-transparent md:px-5 md:py-4">
              <span className="ml-1 mt-1.5 grid h-7 w-7 shrink-0 place-items-center rounded-[7px] bg-[#007AFF] text-white"><CalendarDays className="h-4 w-4" aria-hidden /></span>
              <span className="min-w-0 flex-1 pt-1">
                <span className="flex items-center gap-1 text-[13px] text-ink-muted"><Timer className="h-3.5 w-3.5" aria-hidden />{when(e)}</span>
                <span className="mt-1 block break-words text-[17px] leading-snug text-ink md:text-base">{e.title}</span>
                <span className="mt-1 block text-xs text-ink-faint">In your calendar · tap to open</span>
              </span>
            </button>
          </li>
        ))}
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
        className="ios-circle-btn mt-1 grid h-9 w-9 shrink-0 place-items-center rounded-full text-ink active:scale-95">
        <MoreHorizontal className="h-4 w-4" />
      </button>
      {open && (
        <DropdownMenu ios anchor={trigger} label="Task actions" value="" minWidth={200}
          ghost={<span className="ios-circle-btn grid h-full w-full place-items-center rounded-full text-ink"><MoreHorizontal className="h-4 w-4" /></span>} onClose={() => setOpen(false)}
          groups={[{ title: "", items: [{ id: "log", label: "Log time", icon: Clock }, { id: "edit", label: "Edit", icon: Pencil }, { id: "delete", label: "Delete", icon: Trash2, danger: true }] }]}
          onSelect={(id) => (id === "log" ? onLog() : id === "edit" ? onEdit() : onDelete())} />
      )}
    </>
  );
}

/** "Plan tasks" in liquid glass, just above the +; opens the task planner (many tasks over many days). */
function PlanButton({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} aria-label="Plan tasks for many days" title="Plan tasks for many days"
      className="glass-fab fixed bottom-[calc(max(1.5rem,env(safe-area-inset-bottom))+5rem)] max-md:bottom-[calc(10rem+env(safe-area-inset-bottom))] right-5 z-40 inline-flex h-12 items-center gap-2 rounded-full px-5 text-sm font-medium text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-medium sm:right-8 md:bottom-[7.5rem] md:right-10">
      <span className="absolute inset-0" aria-hidden><LiquidGlass width="100%" height="100%" radius={24} blur={4} /></span>
      <CalendarRange className="relative h-5 w-5" strokeWidth={1.75} aria-hidden />
      <span className="relative">Plan tasks</span>
    </button>
  );
}

/** The floating + in liquid glass, bottom right; opens the New task panel. */
function AddButton({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} aria-label="Add task" title="Add task"
      className="glass-fab fixed bottom-[max(1.5rem,env(safe-area-inset-bottom))] max-md:bottom-[calc(5rem+env(safe-area-inset-bottom))] right-5 z-40 grid h-16 w-16 place-items-center rounded-full text-ink max-md:bg-[#3478F6] max-md:text-white max-md:shadow-themed focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-medium sm:right-8 md:bottom-10 md:right-10">
      <span className="absolute inset-0 max-md:hidden" aria-hidden><LiquidGlass width="100%" height="100%" radius={32} blur={4} /></span>
      <Plus className="relative h-7 w-7 max-md:h-8 max-md:w-8" strokeWidth={1.75} aria-hidden />
    </button>
  );
}


/** Wraps the searched words in <mark>, as the Pacewise docs search does. */
function Marked({ text, q }: { text: string; q: string }) {
  const words = q.split(/\s+/).filter(Boolean).map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  if (!words.length) return <>{text}</>;
  const parts = text.split(new RegExp(`(${words.join("|")})`, "gi"));
  return <>{parts.map((p, i) => (i % 2 ? <mark key={i} className="rounded bg-[#306fdb]/20 px-0.5 text-inherit">{p}</mark> : <span key={i}>{p}</span>))}</>;
}

/** New task, in a liquid glass panel: title, notes, priority, days and time. */
function NewTaskSheet({ tasks, onClose, onCreated, neet }: { tasks: Task[]; onClose: () => void; onCreated: (t: Task) => void; neet: boolean }) {
  const now = today();
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [priority, setPriority] = useState<Priority>("medium");
  const [startDay, setStartDay] = useState(now);
  const [dueDay, setDueDay] = useState(now);
  const [allDay, setAllDay] = useState(true);
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("10:00");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  /** Every title typed is also a search of the NEET syllabus (Physics, Chemistry, Biology), shown like the docs search. */
  const [searching, setSearching] = useState(false);
  const [active, setActive] = useState(-1);
  const syllabus = useMemo(() => (neet ? searchSyllabus(title) : []), [title, neet]);
  /** Everyone: what they added before (saved on the server), listed above the syllabus. */
  const entries = useEntries();
  const found = useMemo(() => searchEntries(entries, title), [entries, title]);
  /** Tasks added before, newest first, one per title: matching what is typed, or the most recent while the title is empty. */
  const suggestions = useMemo(() => {
    const q = title.trim().toLowerCase();
    const seen = new Set<string>();
    const out: Task[] = [];
    for (const t of [...tasks].sort((a, b) => b.createdAt.localeCompare(a.createdAt))) {
      const key = t.title.trim().toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      if (key === q || (q && !key.includes(q))) continue;
      out.push(t);
      if (out.length === 5) break;
    }
    return out;
  }, [tasks, title]);
  /** Past tasks not already listed as an entry; while the title is empty, the recent ones. */
  const pastTasks = useMemo(() => {
    const listed = new Set(found.map((e) => e.title.trim().toLowerCase()));
    return suggestions.filter((t) => !listed.has(t.title.trim().toLowerCase()));
  }, [found, suggestions]);
  const typed = title.trim().length > 0;
  const hitCount = typed ? found.length + pastTasks.length + syllabus.length : pastTasks.length;
  /** One list for every suggestion, the same as in the planner and the Pacewise search: only while typing. */
  const showSyllabus = typed && searching && hitCount > 0;
  useEffect(() => setActive(-1), [title]);
  function pickSyllabus(x: SyllabusItem) {
    setTitle(syllabusTitle(x));
    if (!notes.trim()) setNotes(syllabusNote(x));
    setSearching(false);
    setError(null);
    titleRef.current?.focus();
  }
  /** Picking one of my entries: its title, priority and time, and its notes when none are written yet. */
  function pickEntry(x: Entry) {
    setTitle(x.title);
    if (!notes.trim() && x.notes) setNotes(x.notes);
    setPriority(x.priority);
    setAllDay(!x.startTime);
    if (x.startTime && x.endTime) { setStartTime(x.startTime); setEndTime(x.endTime); }
    setSearching(false);
    setError(null);
    titleRef.current?.focus();
  }
  const nFound = typed ? found.length : 0;
  const pickAt = (i: number) => (i < nFound ? pickEntry(found[i]) : i < nFound + pastTasks.length ? applySuggestion(pastTasks[i - nFound]) : pickSyllabus(syllabus[i - nFound - pastTasks.length]));

  const openTwin = tasks.find((t) => t.status === "open" && t.title.trim().toLowerCase() === title.trim().toLowerCase() && title.trim() && t.startDay <= dueDay && t.dueDay >= startDay);

  /** Fill the form from a task added before (title, notes, priority and time; the days stay as picked). */
  function applySuggestion(t: Task) {
    setTitle(t.title);
    setNotes(t.notes);
    setPriority(t.priority);
    setAllDay(!t.startTime);
    if (t.startTime && t.endTime) { setStartTime(t.startTime); setEndTime(t.endTime); }
    setSearching(false);
    setError(null);
    titleRef.current?.focus();
  }

  useEffect(() => {
    titleRef.current?.focus();
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onClose]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || busy) return;
    const bad = titleProblem(title) ?? planProblem({ startDay, dueDay, startTime: allDay ? null : startTime, endTime: allDay ? null : endTime });
    if (bad) { setError(bad); return; }
    setBusy(true);
    setError(null);
    try {
      onCreated(await todoApi.create({ title: title.trim(), notes: notes.trim(), priority, startDay, dueDay, startTime: allDay ? null : startTime, endTime: allDay ? null : endTime }));
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add the task.");
      setBusy(false);
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-end justify-center bg-canvas/70 p-3 backdrop-blur-[48px] backdrop-saturate-150 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label="New task"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="glass-in relative w-full max-w-lg">
        <span className="absolute inset-0" aria-hidden><LiquidGlass width="100%" height="100%" radius={28} blur={4} /></span>
        <form onSubmit={(e) => void submit(e)} className="relative flex max-h-[85dvh] flex-col gap-5 overflow-y-auto p-6 sm:p-8">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-display text-2xl">New task</h2>
            <button type="button" onClick={onClose} aria-label="Close" className="grid h-9 w-9 place-items-center rounded-full text-ink-muted transition-colors  "><X className="h-5 w-5" /></button>
          </div>
          <label className={LABEL}>Title
            <input ref={titleRef} value={title} onChange={(e) => { setTitle(e.target.value); setSearching(true); }} placeholder={neet ? "What needs doing? Search the NEET syllabus too" : "What needs doing?"} maxLength={120} className={FIELD}
              role="combobox" aria-expanded={showSyllabus} aria-controls="syllabus-results" aria-autocomplete="list" autoComplete="off"
              onKeyDown={(e) => {
                if (!showSyllabus) return;
                if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(hitCount - 1, a + 1)); }
                else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(-1, a - 1)); }
                else if (e.key === "Enter" && active >= 0) { e.preventDefault(); pickAt(active); }
                else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); setSearching(false); }
              }} />
          </label>
          {showSyllabus && (
            <ul id="syllabus-results" role="listbox" aria-label={typed ? (neet ? "Your entries and the NEET syllabus" : "Your entries") : "Recent tasks"} className="-mt-3 flex max-h-72 shrink-0 flex-col overflow-y-auto rounded-2xl border border-overlay/10 bg-canvas/80 p-1.5">
              {(typed ? found : []).map((x, i) => (
                <li key={`entry-${x.id}`} role="option" aria-selected={i === active}>
                  <button type="button" onClick={() => pickEntry(x)} onMouseEnter={() => setActive(i)}
                    className={cn("flex w-full items-start gap-3.5 rounded-xl px-4 py-3 text-left", i === active && "bg-overlay/[0.06]")}>
                    <History className="mt-[3px] h-[18px] w-[18px] shrink-0 text-ink-muted" aria-hidden />
                    <span className="min-w-0">
                      <span className="block text-[15px] font-medium leading-snug tracking-[-0.01em] text-ink"><Marked text={x.title} q={title} /></span>
                      <span className="mt-1 block truncate text-[13px] leading-[1.4] text-ink-muted">{entryPath(x)}</span>
                    </span>
                  </button>
                </li>
              ))}
              {pastTasks.map((t, j) => { const i = nFound + j; return (
                <li key={`task-${t.id}`} role="option" aria-selected={i === active}>
                  <button type="button" onClick={() => applySuggestion(t)} onMouseEnter={() => setActive(i)}
                    className={cn("flex w-full items-start gap-3.5 rounded-xl px-4 py-3 text-left", i === active && "bg-overlay/[0.06]")}>
                    {/* No icon: an empty column of the same width keeps titles in line with the rows above and below. */}
                    {typed && <span className="h-[18px] w-[18px] shrink-0" aria-hidden />}
                    <span className="min-w-0 flex-1">
                      <span className="block text-[15px] font-medium leading-snug tracking-[-0.01em] text-ink"><Marked text={t.title} q={title} /></span>
                      <span className="mt-1 flex min-w-0 items-center gap-2 text-[13px] leading-[1.4] text-ink-muted">
                        <span className={cn("shrink-0 rounded-full px-2 py-px text-[11px] font-medium", t.status === "open" ? "bg-accent-fast/15 text-accent-fast" : "bg-overlay/10 text-ink-muted")}>{t.status === "open" ? "Open" : "Done"}</span>
                        <span className="truncate">{rangeLabel(t.startDay, t.dueDay)}{t.notes ? ` · ${t.notes}` : ""}</span>
                      </span>
                    </span>
                  </button>
                </li>
              ); })}
              {(typed ? syllabus : []).map((x, j) => { const i = nFound + pastTasks.length + j; return (
                <li key={syllabusKey(x)} role="option" aria-selected={i === active}>
                  <button type="button" onClick={() => pickSyllabus(x)} onMouseEnter={() => setActive(i)}
                    className={cn("flex w-full items-start gap-3.5 rounded-xl px-4 py-3 text-left", i === active && "bg-overlay/[0.06]")}>
                    <BookOpen className="mt-[3px] h-[18px] w-[18px] shrink-0 text-ink-muted" aria-hidden />
                    <span className="min-w-0">
                      <span className="block text-[15px] font-medium leading-snug tracking-[-0.01em] text-ink"><Marked text={x.topic ?? x.unit} q={title} /></span>
                      <span className="mt-1 block text-[13px] leading-[1.4] text-ink-muted"><Marked text={syllabusPath(x)} q={title} /></span>
                    </span>
                  </button>
                </li>
              ); })}
            </ul>
          )}
          {openTwin && <p className="-mt-3 text-xs text-accent-fast">This task is already in your list for these days and still open.</p>}
          <label className={LABEL}>Notes (optional)
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} maxLength={2000} placeholder="Details, links, steps…" className={cn(FIELD, "resize-none")} />
          </label>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
            <label className={LABEL}>Priority
              <select value={priority} onChange={(e) => setPriority(e.target.value as Priority)} className={FIELD}>
                <option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option>
              </select>
            </label>
            <label className={LABEL}>Start<input type="date" value={startDay} min={earliestStart(now)} onChange={(e) => { setStartDay(e.target.value); if (e.target.value > dueDay) setDueDay(e.target.value); }} className={FIELD} /></label>
            <label className={LABEL}>Due<input type="date" value={dueDay} min={startDay > now ? startDay : now} onChange={(e) => setDueDay(e.target.value)} className={FIELD} /></label>
          </div>
          <TimeFields clock allDay={allDay} setAllDay={setAllDay} startTime={startTime} setStartTime={setStartTime} endTime={endTime} setEndTime={setEndTime} />
          {error && <p className="text-sm text-accent-extreme" role="alert">{error}</p>}
          <div className="flex justify-end gap-2">
            <GlassButton type="button" onClick={onClose} disabled={busy}>Cancel</GlassButton>
            <GlassButton type="submit" disabled={busy || !title.trim()} strong>{busy ? <ButtonWheel /> : <Plus className="h-4 w-4" />}{busy ? "Adding…" : "Add task"}</GlassButton>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
}
