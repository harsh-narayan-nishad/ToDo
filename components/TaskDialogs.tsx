"use client";
import { useState } from "react";
import { Button, FIELD, LABEL } from "@/components/ui";
import { Modal } from "@/components/Modal";
import { addMinutesToTime, clock, dayLabel, duration, today } from "@/lib/days";
import { earliestStart, loggableDays, logProblem, nowLocal, planProblem, titleProblem, BACKFILL_DAYS } from "@/lib/rules";
import { todoApi, type Priority, type Task } from "@/lib/todo";
import { cn } from "@/lib/utils";

/** "All day" switch plus start / end time. With a time, the task sits in that slot in the Pacewise calendar. */
export function TimeFields({ allDay, setAllDay, startTime, setStartTime, endTime, setEndTime, disabled }: {
  allDay: boolean; setAllDay: (v: boolean) => void; startTime: string; setStartTime: (v: string) => void; endTime: string; setEndTime: (v: string) => void; disabled?: boolean;
}) {
  return (
    <div className="grid grid-cols-1 items-end gap-5 sm:grid-cols-3">
      <label className="flex items-center gap-2 pb-2 text-sm text-ink-muted">
        <input type="checkbox" checked={allDay} disabled={disabled} onChange={(e) => setAllDay(e.target.checked)} className="h-4 w-4 accent-[#7FC97F]" />
        All day
      </label>
      {!allDay && (
        <>
          <label className={LABEL}>From
            <input type="time" value={startTime} disabled={disabled} onChange={(e) => { setStartTime(e.target.value); if (e.target.value && (!endTime || endTime <= e.target.value)) setEndTime(addMinutesToTime(e.target.value, 60)); }} required className={FIELD} />
          </label>
          <label className={LABEL}>To<input type="time" value={endTime} disabled={disabled} onChange={(e) => setEndTime(e.target.value)} required className={FIELD} /></label>
        </>
      )}
    </div>
  );
}

/** Edit title, notes, priority and planned days of a task. A finished task's dates are locked until it is reopened. */
export function EditTaskDialog({ task, onClose, onSaved }: { task: Task; onClose: () => void; onSaved: (t: Task) => void }) {
  const now = today();
  const done = task.status === "done";
  const [title, setTitle] = useState(task.title);
  const [notes, setNotes] = useState(task.notes);
  const [priority, setPriority] = useState<Priority>(task.priority);
  const [startDay, setStartDay] = useState(task.startDay);
  const [dueDay, setDueDay] = useState(task.dueDay);
  const [allDay, setAllDay] = useState(!task.startTime);
  const [startTime, setStartTime] = useState(task.startTime ?? "09:00");
  const [endTime, setEndTime] = useState(task.endTime ?? "10:00");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const plan = { startDay, dueDay, startTime: allDay ? null : startTime, endTime: allDay ? null : endTime };
    const startChanged = plan.startDay !== task.startDay;
    const dueChanged = plan.dueDay !== task.dueDay || plan.startTime !== task.startTime || plan.endTime !== task.endTime;
    const bad = titleProblem(title) ?? planProblem(plan, nowLocal(), { start: startChanged, due: dueChanged });
    if (bad) { setError(bad); return; }
    setBusy(true);
    setError(null);
    try {
      // Only send dates when they changed, so a finished task can still get a new title or notes.
      const dates = startChanged || dueChanged ? plan : {};
      onSaved(await todoApi.update(task.id, { title: title.trim(), notes: notes.trim(), priority, ...dates }));
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save.");
      setBusy(false);
    }
  }

  return (
    <Modal title="Edit task" onClose={onClose}>
      <form onSubmit={(e) => void save(e)} className="flex flex-col gap-5">
        <label className={LABEL}>Title<input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} required className={FIELD} /></label>
        <label className={LABEL}>Notes<textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} maxLength={2000} className={cn(FIELD, "resize-none")} /></label>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
          <label className={LABEL}>Priority
            <select value={priority} onChange={(e) => setPriority(e.target.value as Priority)} className={FIELD}>
              <option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option>
            </select>
          </label>
          <label className={LABEL}>Start
            <input type="date" value={startDay} disabled={done} min={startDay < earliestStart(now) ? startDay : earliestStart(now)} onChange={(e) => { setStartDay(e.target.value); if (e.target.value > dueDay) setDueDay(e.target.value); }} required className={FIELD} />
          </label>
          <label className={LABEL}>Due
            <input type="date" value={dueDay} disabled={done} min={dueDay < now ? dueDay : startDay > now ? startDay : now} onChange={(e) => setDueDay(e.target.value)} required className={FIELD} />
          </label>
        </div>
        <TimeFields allDay={allDay} setAllDay={setAllDay} startTime={startTime} setStartTime={setStartTime} endTime={endTime} setEndTime={setEndTime} disabled={done} />
        {done && <p className="text-xs text-ink-faint">This task is finished, so its dates are locked. Untick it in the list to reopen it and change them.</p>}
        {error && <p className="text-sm text-accent-extreme" role="alert">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button type="submit" disabled={busy}>{busy ? "Saving…" : "Save"}</Button>
        </div>
      </form>
    </Modal>
  );
}

const QUICK = [15, 30, 60, 90, 120];
const hhmm = (d: Date) => `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;

/** Log time worked on a task: today only (past days are locked), never in the future, never after a finished task was finished. */
export function LogTimeDialog({ task, onClose, onLogged }: { task: Task; onClose: () => void; onLogged: (minutes: number) => void }) {
  const now = today();
  const days = loggableDays(task, now);
  const [day, setDay] = useState(days[0] ?? now);
  const [hours, setHours] = useState("0");
  const [mins, setMins] = useState("30");
  const [note, setNote] = useState("");
  const [startTime, setStartTime] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const total = (Number(hours) || 0) * 60 + (Number(mins) || 0);
  const passedToday = nowLocal().minutes;
  // "Just finished" = the block that ends this minute; only possible if it started today.
  const canJustFinish = day === now && total > 0 && total <= passedToday;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const bad = logProblem({ day, minutes: total, startTime: startTime || null });
    if (bad) { setError(bad); return; }
    setBusy(true);
    setError(null);
    try {
      await todoApi.logWork(task.id, day, total, note.trim(), startTime || undefined);
      onLogged(total);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save.");
      setBusy(false);
    }
  }

  if (days.length === 0) {
    return (
      <Modal title="Log time" onClose={onClose}>
        <p className="text-sm text-ink-muted">“{task.title}” was finished on {dayLabel(task.completedDay ?? now, now).toLowerCase()}, which is outside the {BACKFILL_DAYS + 1}-day window for logging time. Reopen it if you are still working on it.</p>
        <div className="mt-6 flex justify-end"><Button variant="ghost" onClick={onClose}>Close</Button></div>
      </Modal>
    );
  }

  return (
    <Modal title="Log time" onClose={onClose}>
      <p className="-mt-3 mb-5 text-sm text-ink-muted">{task.title}</p>
      <form onSubmit={(e) => void save(e)} className="flex flex-col gap-5">
        <div>
          <span className={LABEL}>Day</span>
          <div className="mt-2 flex flex-wrap gap-2">
            {days.map((d) => (
              <Button key={d} type="button" size="sm" variant={d === day ? "primary" : "outline"} onClick={() => setDay(d)}>{dayLabel(d, now)}</Button>
            ))}
          </div>
          <p className="mt-2 text-xs text-ink-faint">
            {day === now ? `So far today: ${duration(passedToday)} have passed, so you can log up to that.` : `Forgot to log? You can fill in the last ${BACKFILL_DAYS} days too.`}
          </p>
        </div>
        <div className="grid grid-cols-2 gap-5">
          <label className={LABEL}>Hours<input type="number" inputMode="numeric" min={0} max={16} value={hours} onChange={(e) => setHours(e.target.value)} className={FIELD} /></label>
          <label className={LABEL}>Minutes<input type="number" inputMode="numeric" min={0} max={59} value={mins} onChange={(e) => setMins(e.target.value)} className={FIELD} /></label>
        </div>
        <div className="flex flex-wrap gap-2">
          {QUICK.map((q) => (
            <Button key={q} type="button" size="sm" variant="ghost" className="border border-overlay/10" onClick={() => { setHours(String(Math.floor(q / 60))); setMins(String(q % 60)); }}>{duration(q)}</Button>
          ))}
        </div>
        <div>
          <div className="flex items-end gap-3">
            <label className={cn(LABEL, "flex-1")}>Started at (optional)
              <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} className={FIELD} />
            </label>
            {canJustFinish && <Button type="button" size="sm" variant="outline" onClick={() => setStartTime(hhmm(new Date(Date.now() - total * 60_000)))}>Just finished</Button>}
            {startTime && <Button type="button" size="sm" variant="ghost" onClick={() => setStartTime("")}>Clear</Button>}
          </div>
          <p className="mt-2 text-xs text-ink-faint">
            {startTime ? `Shows in your Pacewise calendar as ${clock(startTime)} – ${clock(addMinutesToTime(startTime, total))}.` : "Add a start time to see this work as a block in your Pacewise calendar."}
          </p>
        </div>
        <label className={LABEL}>What did you do? (optional)<input value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} className={FIELD} /></label>
        {error && <p className="text-sm text-accent-extreme" role="alert">{error}</p>}
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm text-ink-muted">{duration(total)}</span>
          <div className="flex gap-2">
            <Button type="button" variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button>
            <Button type="submit" disabled={busy}>{busy ? "Saving…" : "Log time"}</Button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
