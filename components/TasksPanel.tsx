"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, Clock, Pencil, Plus, Trash2 } from "lucide-react";
import { Badge, Button, Card, ConfirmDialog, Empty, FIELD, LABEL } from "@/components/ui";
import { EditTaskDialog, LogTimeDialog, TimeFields } from "@/components/TaskDialogs";
import { earliestStart, planProblem, titleProblem } from "@/lib/rules";
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
    <div className="flex flex-col gap-8">
      <NewTask onCreated={(t) => { setTasks((list) => [t, ...(list ?? [])]); onChanged(); }} />

      <div className="flex flex-wrap items-center gap-2">
        {(["open", "done", "all"] as Filter[]).map((f) => (
          <Button key={f} size="sm" variant={filter === f ? "primary" : "outline"} onClick={() => setFilter(f)}>{f === "open" ? "To do" : f === "done" ? "Done" : "All"}</Button>
        ))}
        {tasks && <span className="ml-auto text-sm text-ink-faint">{tasks.filter((t) => t.status === "open").length} open · {tasks.filter((t) => t.status === "done").length} done</span>}
      </div>

      {error && <p className="text-sm text-accent-extreme" role="alert">{error}</p>}
      {tasks === null && !error && <p className="text-sm text-ink-muted">Loading…</p>}
      {tasks !== null && groups.length === 0 && <Empty>{filter === "done" ? "Nothing finished yet." : "No tasks. Add one above. It also appears in your Pacewise calendar."}</Empty>}

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
  return (
    <li className="flex items-start gap-4 px-4 py-4 sm:px-5">
      <button onClick={onToggle} aria-label={done ? "Mark as not done" : "Mark as done"}
        className={cn("mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center border transition-colors", done ? "border-accent-medium bg-accent-medium text-canvas" : "border-overlay/30 hover:border-accent-medium")}>
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
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <Button size="sm" variant="ghost" onClick={onLog} aria-label="Log time"><Clock className="h-4 w-4" /><span className="hidden sm:inline">Log time</span></Button>
        <Button size="sm" variant="ghost" onClick={onEdit} aria-label="Edit"><Pencil className="h-4 w-4" /></Button>
        <Button size="sm" variant="ghost" onClick={onDelete} aria-label="Delete" className="hover:text-accent-extreme"><Trash2 className="h-4 w-4" /></Button>
      </div>
    </li>
  );
}

function NewTask({ onCreated }: { onCreated: (t: Task) => void }) {
  const now = today();
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [priority, setPriority] = useState<Priority>("medium");
  const [startDay, setStartDay] = useState(now);
  const [dueDay, setDueDay] = useState(now);
  const [allDay, setAllDay] = useState(true);
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("10:00");
  const [more, setMore] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || busy) return;
    const bad = titleProblem(title) ?? planProblem({ startDay, dueDay, startTime: allDay ? null : startTime, endTime: allDay ? null : endTime });
    if (bad) { setError(bad); return; }
    setBusy(true);
    setError(null);
    try {
      onCreated(await todoApi.create({ title: title.trim(), notes: notes.trim(), priority, startDay, dueDay, startTime: allDay ? null : startTime, endTime: allDay ? null : endTime }));
      setTitle("");
      setNotes("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add the task.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <form onSubmit={(e) => void submit(e)} className="flex flex-col gap-5">
        <div className="flex items-end gap-3">
          <label className={cn(LABEL, "flex-1")}>New task
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="What needs doing?" maxLength={120} className={FIELD} />
          </label>
          <Button type="submit" disabled={busy || !title.trim()}><Plus className="h-4 w-4" />Add</Button>
        </div>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
          <label className={LABEL}>Priority
            <select value={priority} onChange={(e) => setPriority(e.target.value as Priority)} className={FIELD}>
              <option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option>
            </select>
          </label>
          <label className={LABEL}>Start<input type="date" value={startDay} min={earliestStart(now)} onChange={(e) => { setStartDay(e.target.value); if (e.target.value > dueDay) setDueDay(e.target.value); }} className={FIELD} /></label>
          <label className={LABEL}>Due<input type="date" value={dueDay} min={startDay > now ? startDay : now} onChange={(e) => setDueDay(e.target.value)} className={FIELD} /></label>
        </div>
        <TimeFields allDay={allDay} setAllDay={setAllDay} startTime={startTime} setStartTime={setStartTime} endTime={endTime} setEndTime={setEndTime} />
        {more ? (
          <label className={LABEL}>Notes<textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} maxLength={2000} className={cn(FIELD, "resize-none")} /></label>
        ) : (
          <button type="button" onClick={() => setMore(true)} className="self-start text-sm text-ink-muted hover:text-ink">+ Add notes</button>
        )}
        {error && <p className="text-sm text-accent-extreme" role="alert">{error}</p>}
      </form>
    </Card>
  );
}
