"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import LiquidGlass from "@/components/LiquidGlass";
import { PanelLoader } from "@/components/WheelSpinner";
import { Check, Clock, Lock, Pencil, Plus, Sparkles, Trash2, X } from "lucide-react";
import { Badge, Button, ConfirmDialog, Empty, FIELD, LABEL } from "@/components/ui";
import { EditTaskDialog, LogTimeDialog, TimeFields } from "@/components/TaskDialogs";
import { earliestStart, lockedProblem, planProblem, titleProblem } from "@/lib/rules";
import { duration, rangeLabel, today, whenLabel } from "@/lib/days";
import { todoApi, type Priority, type Task } from "@/lib/todo";
import { cn } from "@/lib/utils";

type Filter = "open" | "done" | "all";
const PRIORITY_TONE = { high: "red", medium: "amber", low: "blue" } as const;
const RANK: Record<Priority, number> = { high: 0, medium: 1, low: 2 };

export function TasksPanel({ onChanged, refreshKey = 0 }: { onChanged: () => void; refreshKey?: number }) {
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("open");
  const [editing, setEditing] = useState<Task | null>(null);
  const [logging, setLogging] = useState<Task | null>(null);
  const [deleting, setDeleting] = useState<Task | null>(null);
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    try { setTasks(await todoApi.tasks()); setError(null); } catch (e) { setError(e instanceof Error ? e.message : "Could not load tasks."); }
  }, []);
  useEffect(() => { void load(); }, [load, refreshKey]);

  const replace = (t: Task) => setTasks((list) => (list ?? []).map((x) => (x.id === t.id ? { ...x, ...t } : x)));

  async function toggle(t: Task) {
    const status = t.status === "done" ? "open" : "done";
    replace({ ...t, status });
    try { replace(await todoApi.update(t.id, { status })); onChanged(); } catch (e) { replace(t); setError(e instanceof Error ? e.message : "Could not update."); }
  }

  const now = today();
  const groups = useMemo(() => {
    const list = (tasks ?? []).filter((t) => filter === "all" || t.status === filter);
    const sort = (a: Task, b: Task) => a.dueDay.localeCompare(b.dueDay) || RANK[a.priority] - RANK[b.priority];
    const open = list.filter((t) => t.status === "open").sort(sort);
    return [
      { key: "overdue", title: "Overdue", items: open.filter((t) => t.dueDay < now) },
      { key: "today", title: "Today", items: open.filter((t) => t.startDay <= now && t.dueDay >= now) },
      { key: "upcoming", title: "Upcoming", items: open.filter((t) => t.startDay > now) },
      { key: "done", title: "Done", items: list.filter((t) => t.status === "done").sort((a, b) => (b.completedDay ?? "").localeCompare(a.completedDay ?? "")) },
    ].filter((g) => g.items.length > 0);
  }, [tasks, filter, now]);

  return (
    <div className="flex flex-col gap-8 pb-24">
      <div className="flex flex-wrap items-center gap-2">
        {(["open", "done", "all"] as Filter[]).map((f) => (
          <Button key={f} size="sm" variant={filter === f ? "primary" : "outline"} onClick={() => setFilter(f)}>{f === "open" ? "To do" : f === "done" ? "Done" : "All"}</Button>
        ))}
        {tasks && <span className="ml-auto text-sm text-ink-faint">{tasks.filter((t) => t.status === "open").length} open · {tasks.filter((t) => t.status === "done").length} done</span>}
      </div>

      {error && <p className="text-sm text-accent-extreme" role="alert">{error}</p>}
      {tasks === null && !error && <PanelLoader label="Loading tasks" />}
      {tasks !== null && groups.length === 0 && <Empty>{filter === "done" ? "Nothing finished yet." : "No tasks yet. Tap + to add one. It also appears in your Pacewise calendar."}</Empty>}

      {groups.map((g) => (
        <section key={g.key}>
          <h2 className={cn("mb-3 text-sm uppercase tracking-wide", g.key === "overdue" ? "text-accent-extreme" : "text-ink-muted")}>{g.title} · {g.items.length}</h2>
          <ul className="flex flex-col divide-y divide-overlay/10 border border-overlay/10 bg-canvas-raised">
            {g.items.map((t) => (
              <TaskRow key={t.id} task={t} onToggle={() => void toggle(t)} onEdit={() => setEditing(t)} onLog={() => setLogging(t)} onDelete={() => setDeleting(t)} />
            ))}
          </ul>
        </section>
      ))}

      <AddButton onClick={() => setAdding(true)} />
      {adding && <NewTaskSheet tasks={tasks ?? []} onClose={() => setAdding(false)} onCreated={(t) => { setTasks((list) => [t, ...(list ?? [])]); onChanged(); }} />}

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

function TaskRow({ task: t, onToggle, onEdit, onLog, onDelete }: { task: Task; onToggle: () => void; onEdit: () => void; onLog: () => void; onDelete: () => void }) {
  const done = t.status === "done";
  /** Past days are read-only: no ticking, logging, editing or deleting. */
  const locked = lockedProblem(t, today());
  return (
    <li className="flex items-start gap-4 px-4 py-4 sm:px-5">
      <button onClick={onToggle} disabled={!!locked} title={locked ?? undefined} aria-label={done ? "Mark as not done" : "Mark as done"}
        className={cn("mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center border transition-colors disabled:cursor-not-allowed disabled:opacity-60", done ? "border-accent-medium bg-accent-medium text-canvas" : "border-overlay/30")}>
        {done && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
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
    </li>
  );
}

/** The floating + in liquid glass, bottom right; opens the New task panel. */
function AddButton({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} aria-label="Add task" title="Add task"
      className="glass-fab fixed bottom-[max(1.5rem,env(safe-area-inset-bottom))] right-5 z-40 grid h-16 w-16 place-items-center rounded-full text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-medium sm:right-8 md:bottom-10 md:right-10">
      <span className="absolute inset-0" aria-hidden><LiquidGlass width="100%" height="100%" radius={32} blur={4} /></span>
      <Plus className="relative h-7 w-7" strokeWidth={1.75} aria-hidden />
    </button>
  );
}

/** A pill button in liquid glass, for the New task panel. `strong` = the main action (bolder, lightly tinted). */
function GlassButton({ strong, className, children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { strong?: boolean }) {
  return (
    <button {...props}
      className={cn("glass-fab relative inline-flex h-11 items-center justify-center gap-2 rounded-full px-6 text-sm text-ink disabled:pointer-events-none disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-medium", strong && "font-semibold", className)}>
      <span className="absolute inset-0" aria-hidden><LiquidGlass width="100%" height="100%" radius={22} blur={4} /></span>
      {strong && <span className="absolute inset-0 rounded-full bg-overlay/10" aria-hidden />}
      <span className="relative inline-flex items-center gap-2">{children}</span>
    </button>
  );
}

/** New task, in a liquid glass panel: title, notes, priority, days and time. */
function NewTaskSheet({ tasks, onClose, onCreated }: { tasks: Task[]; onClose: () => void; onCreated: (t: Task) => void }) {
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
  const openTwin = tasks.find((t) => t.status === "open" && t.title.trim().toLowerCase() === title.trim().toLowerCase() && title.trim());

  /** Fill the form from a task added before (title, notes, priority and time; the days stay as picked). */
  function applySuggestion(t: Task) {
    setTitle(t.title);
    setNotes(t.notes);
    setPriority(t.priority);
    setAllDay(!t.startTime);
    if (t.startTime && t.endTime) { setStartTime(t.startTime); setEndTime(t.endTime); }
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
            <input ref={titleRef} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="What needs doing?" maxLength={120} className={FIELD} />
          </label>
          {openTwin && <p className="-mt-3 text-xs text-accent-fast">This task is already in your list and still open.</p>}
          {suggestions.length > 0 && (
            <div className="-mt-2">
              <p className="mb-2 flex items-center gap-1.5 text-xs text-ink-faint"><Sparkles className="h-3.5 w-3.5" aria-hidden />{title.trim() ? "Added before" : "Recent tasks"}</p>
              <div className="flex flex-wrap gap-2">
                {suggestions.map((t) => (
                  <button key={t.id} type="button" onClick={() => applySuggestion(t)} title={t.notes || t.title}
                    className="inline-flex max-w-full items-center gap-2 rounded-full border border-overlay/15 bg-overlay/5 px-3.5 py-1.5 text-sm text-ink transition-colors  ">
                    <span className="truncate">{t.title}</span>
                    {t.status === "open" ? <span className="shrink-0 text-xs text-accent-fast">open</span> : <span className="shrink-0 text-xs text-ink-faint">done</span>}
                  </button>
                ))}
              </div>
            </div>
          )}
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
            <GlassButton type="submit" disabled={busy || !title.trim()} strong><Plus className="h-4 w-4" />{busy ? "Adding…" : "Add task"}</GlassButton>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
}
