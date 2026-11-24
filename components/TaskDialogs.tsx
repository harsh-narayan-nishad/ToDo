"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown } from "lucide-react";
import { Button, FIELD, LABEL } from "@/components/ui";
import { Modal } from "@/components/Modal";
import { addMinutesToTime, clock, dayLabel, duration, today } from "@/lib/days";
import { earliestStart, loggableDays, logProblem, nowLocal, planProblem, titleProblem, BACKFILL_DAYS } from "@/lib/rules";
import { todoApi, type Priority, type Task } from "@/lib/todo";
import { goalsApi, periodLabel, type Goal } from "@/lib/goals";
import { cn } from "@/lib/utils";
import LiquidGlass from "@/components/LiquidGlass";
import { ButtonWheel } from "@/components/WheelSpinner";
import OptionWheel from "@/components/OptionWheel";

const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
const toTime = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
const DAY = 24 * 60;

/**
 * Analog clock time picker. One dial, one gesture: drag the hand round (or tap anywhere on the face) and the hour
 * and minutes are set together, in 5-minute steps — a full turn of the hour hand is 12 hours, so the minute hand
 * follows on its own. AM / PM picks the half of the day; arrow keys move 5 minutes.
 */
export function AnalogClock({ value, onChange, from, label }: { value: string; onChange: (v: string) => void; from?: string; label: string }) {
  const svgRef = useRef<SVGSVGElement>(null);
  /** Which hand is being moved: grabbed near the minute hand's tip → minutes, anywhere else → the hour hand. */
  const dragging = useRef<"hour" | "minute" | null>(null);
  const total = toMin(value || "09:00");
  const latest = useRef(total);
  latest.current = total;
  const pm = total >= 720;
  const hourAngle = ((total % 720) / 720) * 360;
  const minuteAngle = ((total % 60) / 60) * 360;
  const span = from ? total - toMin(from) : 0;

  /** Pointer position in the dial's own 200 × 200 units, centred on 0, 0. */
  function point(e: React.PointerEvent) {
    const box = svgRef.current?.getBoundingClientRect();
    if (!box) return null;
    const x = ((e.clientX - box.left) / box.width) * 200 - 100;
    const y = ((e.clientY - box.top) / box.height) * 200 - 100;
    return { x, y, r: Math.hypot(x, y), angle: ((Math.atan2(x, -y) * 180) / Math.PI + 360) % 360 };
  }
  function grab(e: React.PointerEvent) {
    const p = point(e);
    if (!p) return;
    const tip = at(((latest.current % 60) / 60) * 360, 74);
    dragging.current = Math.hypot(p.x + 100 - tip.x, p.y + 100 - tip.y) < 22 ? "minute" : "hour";
    move(e);
  }
  function move(e: React.PointerEvent) {
    const p = point(e);
    if (!p || p.r < 12 || !dragging.current) return; // the very centre has no direction
    const now = latest.current;
    let next: number;
    if (dragging.current === "minute") {
      // the minute hand: 1-minute steps, the hour stays; going past 12 carries the hour on (or back), like a real clock
      const mins = Math.round(p.angle / 6) % 60;
      const prev = now % 60;
      let hour = Math.floor(now / 60);
      if (prev >= 45 && mins < 15) hour += 1;
      else if (prev < 15 && mins >= 45) hour -= 1;
      next = (((hour * 60 + mins) % DAY) + DAY) % DAY;
    } else {
      const step = Math.round((p.angle / 360) * 144) % 144; // 144 five-minute steps in 12 hours
      next = (now >= 720 ? 720 : 0) + step * 5;
    }
    if (next !== now) { latest.current = next; onChange(toTime(next)); }
  }
  function onKey(e: React.KeyboardEvent) {
    const d = e.key === "ArrowUp" || e.key === "ArrowRight" ? 5 : e.key === "ArrowDown" || e.key === "ArrowLeft" ? -5 : 0;
    if (!d) return;
    e.preventDefault();
    onChange(toTime((total + d + DAY) % DAY));
  }
  function at(deg: number, r: number) { return { x: 100 + r * Math.sin((deg * Math.PI) / 180), y: 100 - r * Math.cos((deg * Math.PI) / 180) }; }
  const hourTip = at(hourAngle, 50);
  const minuteTip = at(minuteAngle, 74);
  const minuteTail = at(minuteAngle + 180, 12);
  const hourTail = at(hourAngle + 180, 10);

  return (
    <div className="flex flex-col items-center gap-4 rounded-3xl border border-overlay/10 bg-overlay/5 px-4 py-5">
      <div className="flex w-full items-center justify-between gap-3">
        <div>
          <p className="font-display text-3xl tabular-nums text-ink">{clock(toTime(total))}</p>
          <p className="text-xs text-ink-faint">{from ? (span > 0 ? `Lasts ${duration(span)}` : "Ends next day or before start") : "Drag either hand or tap the clock"}</p>
        </div>
        <div className="flex rounded-full border border-overlay/15 p-0.5 text-xs" role="group" aria-label="Half of the day">
          {(["AM", "PM"] as const).map((h) => {
            const on = (h === "PM") === pm;
            return (
              <button key={h} type="button" aria-pressed={on} onClick={() => !on && onChange(toTime((total + 720) % DAY))}
                className={cn("rounded-full px-3 py-1 transition-colors", on ? "bg-ink text-canvas" : "text-ink-muted ")}>{h}</button>
            );
          })}
        </div>
      </div>
      <div className="relative h-56 w-56">
      <svg ref={svgRef} viewBox="0 0 200 200" className="absolute inset-0 h-full w-full cursor-pointer touch-none select-none outline-none focus-visible:rounded-full focus-visible:ring-2 focus-visible:ring-accent-medium"
        role="slider" tabIndex={0} aria-label={label} aria-valuemin={0} aria-valuemax={DAY - 5} aria-valuenow={total} aria-valuetext={clock(toTime(total))}
        onKeyDown={onKey}
        onPointerDown={(e) => { (e.currentTarget as Element).setPointerCapture(e.pointerId); grab(e); }}
        onPointerMove={move}
        onPointerUp={() => { dragging.current = null; }}
        onPointerCancel={() => { dragging.current = null; }}>
        <circle cx="100" cy="100" r="96" className="fill-canvas stroke-overlay/15" strokeWidth="1" />
        {Array.from({ length: 60 }, (_, i) => {
          const major = i % 5 === 0;
          const o = at(i * 6, 92);
          const n = at(i * 6, major ? 84 : 88);
          return <line key={i} x1={o.x} y1={o.y} x2={n.x} y2={n.y} strokeLinecap="round" strokeWidth={major ? 2 : 1} className={major ? "stroke-ink/70" : "stroke-ink/25"} />;
        })}
        {Array.from({ length: 12 }, (_, i) => {
          const h = i === 0 ? 12 : i;
          const p = at(i * 30, 70);
          return <text key={h} x={p.x} y={p.y} textAnchor="middle" dominantBaseline="central" className="fill-ink-muted text-[13px]">{h}</text>;
        })}
        {/* watch-style hands: a short tail past the centre, a slim minute hand and a bolder hour hand */}
        <line x1={minuteTail.x} y1={minuteTail.y} x2={minuteTip.x} y2={minuteTip.y} strokeLinecap="round" strokeWidth="1.75" className="stroke-ink/70" />
        <line x1={hourTail.x} y1={hourTail.y} x2={hourTip.x} y2={hourTip.y} strokeLinecap="round" strokeWidth="4" className="stroke-ink" />
        <circle cx="100" cy="100" r="5" className="fill-canvas stroke-ink" strokeWidth="2" />
      </svg>
      {/* the grips at the hand tips: small lenses of liquid glass (the clock handles the dragging, so they let touches through) */}
      <Knob x={minuteTip.x} y={minuteTip.y} size={20} />
      <Knob x={hourTip.x} y={hourTip.y} size={26} strong />
      </div>
    </div>
  );
}

/** "All day" switch plus start / end time. With a time, the task sits in that slot in the Pacewise calendar. `clock` = one-tap time lists instead of typed times. */
export function TimeFields({ allDay, setAllDay, startTime, setStartTime, endTime, setEndTime, disabled, clock: useClock }: {
  allDay: boolean; setAllDay: (v: boolean) => void; startTime: string; setStartTime: (v: string) => void; endTime: string; setEndTime: (v: string) => void; disabled?: boolean; clock?: boolean;
}) {
  if (useClock) return <ClockTimeFields {...{ allDay, setAllDay, startTime, setStartTime, endTime, setEndTime, disabled }} />;
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
  /** The goal it counts toward ("" = none): goals in progress, plus its current one even if already reached. */
  const [goalId, setGoalId] = useState(task.goalId ?? "");
  const [goals, setGoals] = useState<Goal[]>([]);
  useEffect(() => { goalsApi.list().then((g) => setGoals(g.filter((x) => x.status === "open" || x.id === task.goalId)), () => undefined); }, [task.goalId]);
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
      const goal = (goalId || null) !== (task.goalId ?? null) ? { goalId: goalId || null } : {};
      onSaved(await todoApi.update(task.id, { title: title.trim(), notes: notes.trim(), priority, ...dates, ...goal }));
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
        <label className={LABEL}>Goal
          <select value={goalId} onChange={(e) => setGoalId(e.target.value)} className={FIELD}>
            <option value="">No goal</option>
            {goals.map((g) => <option key={g.id} value={g.id}>{g.title} · {periodLabel(g.period)}</option>)}
          </select>
        </label>
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
          <Button type="submit" disabled={busy}>{busy && <ButtonWheel />}{busy ? "Saving…" : "Save"}</Button>
        </div>
      </form>
    </Modal>
  );
}

/** A round liquid glass grip on a clock hand, at x, y in the dial's 200 × 200 units. `strong` = the hour hand's (larger, with a centre mark). */
function Knob({ x, y, size, strong }: { x: number; y: number; size: number; strong?: boolean }) {
  return (
    <span className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2" style={{ left: `${x / 2}%`, top: `${y / 2}%`, width: size, height: size }} aria-hidden>
      <LiquidGlass width="100%" height="100%" radius={size / 2} blur={2} />
      <span className={cn("absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full", strong ? "h-1.5 w-1.5 bg-accent-medium" : "h-1 w-1 bg-ink/70")} />
    </span>
  );
}

/** The clock as a popup of liquid glass above everything (also above the New task panel and the planner). Escape, a click outside or Done closes only the popup. */
export function ClockPopup({ title, onClose, children, busy = false }: { title: string; onClose: () => void; children: React.ReactNode;
  /** Saving: Done shows the loader and the popup stays open until it is saved. */
  busy?: boolean;
}) {
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopImmediatePropagation(); if (!busy) onClose(); } };
    window.addEventListener("keydown", esc, true); // first, so the panel underneath stays open
    return () => window.removeEventListener("keydown", esc, true);
  }, [onClose, busy]);
  return createPortal(
    // Smooth on every device: a plain dim and a solid Apple-style panel (no backdrop blur or glass lens to compute while
    // it opens and while the wheel spins inside it); only transform and opacity animate, on the GPU.
    <div className="notif-dim fade-in fixed inset-0 z-[150] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label={title}
      onMouseDown={(e) => { e.stopPropagation(); if (e.target === e.currentTarget && !busy) onClose(); }}>
      <div className="pw-notif glass-in relative w-full max-w-sm rounded-[28px] shadow-themed [backface-visibility:hidden] [will-change:transform,opacity]">
        <div className="relative flex flex-col gap-4 p-5 sm:p-6">
          <h3 className="font-display text-xl">{title}</h3>
          {children}
          <div className="flex justify-end">
            <button type="button" onClick={onClose} disabled={busy} aria-busy={busy}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-[#3478F6] px-7 text-[15px] font-semibold text-white transition-[transform,opacity] active:scale-[0.97] disabled:opacity-80">
              {busy && <ButtonWheel />}{busy ? "Saving…" : "Done"}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/** TimeFields with the analog clock: From and To show the time, and the picked one opens the clock below them. */
function ClockTimeFields({ allDay, setAllDay, startTime, setStartTime, endTime, setEndTime, disabled }: {
  allDay: boolean; setAllDay: (v: boolean) => void; startTime: string; setStartTime: (v: string) => void; endTime: string; setEndTime: (v: string) => void; disabled?: boolean;
}) {
  const [open, setOpen] = useState<"from" | "to" | null>(null);
  const field = (which: "from" | "to", label: string, value: string) => (
    <div className={LABEL}>
      <span>{label}</span>
      <button type="button" disabled={disabled} onClick={() => setOpen((o) => (o === which ? null : which))} aria-expanded={open === which}
        className={cn(FIELD, "flex items-center justify-between text-left disabled:opacity-40", open === which && "border-accent-medium")}>
        <span className="tabular-nums">{clock(value)}</span>
        <ChevronDown className={cn("h-4 w-4 text-ink-muted transition-transform", open === which && "rotate-180")} aria-hidden />
      </button>
    </div>
  );
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 items-start gap-5 sm:grid-cols-3">
        <label className="flex items-center gap-2 pt-7 text-sm text-ink-muted">
          <input type="checkbox" checked={allDay} disabled={disabled} onChange={(e) => { setAllDay(e.target.checked); setOpen(null); }} className="h-4 w-4 accent-[#7FC97F]" />
          All day
        </label>
        {!allDay && field("from", "From", startTime)}
        {!allDay && field("to", "To", endTime)}
      </div>
      {!allDay && open === "from" && (
        <ClockPopup title="Start time" onClose={() => setOpen(null)}>
          <AnalogClock label="Start time" value={startTime} onChange={(v) => { setStartTime(v); if (!endTime || endTime <= v) setEndTime(addMinutesToTime(v, 60)); }} />
        </ClockPopup>
      )}
      {!allDay && open === "to" && (
        <ClockPopup title="End time" onClose={() => setOpen(null)}>
          <AnalogClock label="End time" value={endTime} from={startTime} onChange={setEndTime} />
        </ClockPopup>
      )}
    </div>
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
  const [wheel, setWheel] = useState(false);
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
        {/* Tap to pick the time worked on the Pacewise option wheel (scroll or drag), as on a time habit. */}
        <div className={LABEL}>
          <span>Time worked</span>
          <button type="button" onClick={() => setWheel(true)} aria-label={`Time worked: ${duration(total)}. Pick on the wheel`}
            className={cn(FIELD, "flex items-center justify-between text-left", wheel && "border-accent-medium")}>
            <span className="tabular-nums">{duration(total)}</span>
            <ChevronDown className="h-4 w-4 text-ink-muted" aria-hidden />
          </button>
        </div>
        {wheel && <WorkWheel value={total} onChange={(m) => { setHours(String(Math.floor(m / 60))); setMins(String(m % 60)); }} onClose={() => setWheel(false)} />}
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
            <Button type="submit" disabled={busy}>{busy && <ButtonWheel />}{busy ? "Saving…" : "Log time"}</Button>
          </div>
        </div>
      </form>
    </Modal>
  );
}

/** The Pacewise option wheel for time worked on a task: 5-minute steps up to 16 hours. */
function WorkWheel({ value, onChange, onClose }: { value: number; onChange: (m: number) => void; onClose: () => void }) {
  const values = useMemo(() => {
    const list: number[] = [];
    for (let v = 5; v <= 16 * 60; v += 5) list.push(v);
    if (value > 0 && value <= 16 * 60 && !list.includes(value)) list.push(value);
    return list.sort((a, b) => a - b);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- fixed while open, so the wheel's rows never shift under it
  return (
    <ClockPopup title="Time worked" onClose={onClose}>
      <p className="-mt-2 text-sm text-ink-muted">Scroll or drag to set how long you worked.</p>
      <div className="relative h-64">
        <span className="pointer-events-none absolute inset-x-0 top-1/2 h-12 -translate-y-1/2 border-y border-overlay/15 bg-overlay/[0.04]" aria-hidden />
        <OptionWheel
          items={values.map((v) => duration(v))}
          defaultSelected={Math.max(0, values.indexOf(value))}
          textColor="rgb(var(--ink-faint))"
          activeColor="rgb(var(--ink))"
          side="left"
          fontSize={1.75}
          spacing={1.6}
          curve={1}
          tilt={8}
          blur={1.5}
          fade={0.28}
          smoothing={160}
          inset={24}
          loop={false}
          draggable
          onChange={(i) => onChange(values[i])}
        />
      </div>
    </ClockPopup>
  );
}

/**
 * Your own notes on a task or habit (how to beat it, what works), in the same popup as the option wheel.
 * Read them, type to change them; they are saved when the popup closes (Done, a tap outside, or Esc).
 */
export function NotesPopup({ title, value, placeholder, onSave, onClose, readOnly = false }: {
  title: string; value: string; placeholder?: string; onSave: (notes: string) => Promise<void>; onClose: () => void;
  /** View notes: shown to read, not to edit. */
  readOnly?: boolean;
}) {
  const [text, setText] = useState(value);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const close = async () => {
    if (busy) return;
    if (text.trim() === value.trim()) { onClose(); return; }
    setBusy(true);
    setError(null);
    try { await onSave(text.trim()); onClose(); } catch (e) { setError(e instanceof Error ? e.message : "Could not save the notes."); setBusy(false); }
  };
  if (readOnly) return (
    <ClockPopup title={title} onClose={onClose}>
      <div className="max-h-[50dvh] overflow-y-auto whitespace-pre-wrap break-words rounded-2xl bg-overlay/[0.04] px-4 py-3 text-[15px] leading-relaxed text-ink">{value}</div>
    </ClockPopup>
  );
  return (
    <ClockPopup title={title} onClose={() => void close()} busy={busy}>
      <p className="-mt-2 text-sm text-ink-muted">Your notes: how to beat it, what works, what to remember. Saved when you close this.</p>
      <textarea value={text} onChange={(e) => setText(e.target.value)} disabled={busy} rows={8} maxLength={2000} placeholder={placeholder ?? "e.g. Start with the easiest part. Phone in another room."} autoFocus
        className="w-full resize-none rounded-2xl border border-overlay/10 bg-overlay/[0.04] px-4 py-3 text-[15px] leading-relaxed text-ink outline-none placeholder:text-ink-faint focus:border-overlay/25 disabled:opacity-60" />
      <p className="-mt-2 text-right text-xs tabular-nums text-ink-faint">{text.length} / 2000</p>
      {error && <p className="-mt-2 text-sm text-accent-extreme" role="alert">{error}</p>}
    </ClockPopup>
  );
}

/**
 * Time spent on a task today, on the Pacewise option wheel (5-minute steps up to 16 hours), like a time habit: more than
 * planned (planned 1 h, worked 2 h) or less (planned 1 h, stopped after 30 min). Saved when the popup closes, only if moved.
 */
export function SpentWheel({ title, value, planned, onSave, onClose }: {
  title: string; value: number; planned: number | null; onSave: (minutes: number) => Promise<void>; onClose: () => void;
}) {
  const start = value > 0 ? value : (planned ?? 30);
  const [picked, setPicked] = useState(start);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const values = useMemo(() => {
    const list: number[] = [];
    for (let v = 0; v <= 16 * 60; v += 5) list.push(v);
    if (!list.includes(start)) list.push(start);
    return list.sort((a, b) => a - b);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- fixed while open, so the rows never shift under the wheel
  /** Saved only if the wheel was moved to a new value: just looking changes nothing. */
  const moved = useRef(false);
  const close = async () => {
    if (busy) return;
    if (!moved.current || picked === value) { onClose(); return; }
    setBusy(true);
    setError(null);
    try { await onSave(picked); onClose(); } catch (e) { setError(e instanceof Error ? e.message : "Could not save the time."); setBusy(false); }
  };
  return (
    <ClockPopup title={title} onClose={() => void close()} busy={busy}>
      <p className="-mt-2 text-sm text-ink-muted">
        Time spent today{planned ? ` · planned ${duration(planned)}` : ""}. Scroll or drag to set it; tick the task to finish it.
      </p>
      <div className={cn("relative h-64 transition-opacity", busy && "pointer-events-none opacity-60")}>
        <span className="pointer-events-none absolute inset-x-0 top-1/2 h-12 -translate-y-1/2 border-y border-overlay/15 bg-overlay/[0.04]" aria-hidden />
        <OptionWheel
          items={values.map((v) => (v === 0 ? "0 min" : duration(v)))}
          defaultSelected={Math.max(0, values.indexOf(start))}
          textColor="rgb(var(--ink-faint))"
          activeColor="rgb(var(--ink))"
          side="left"
          fontSize={1.75}
          spacing={1.6}
          curve={1}
          tilt={8}
          blur={1.5}
          fade={0.28}
          smoothing={160}
          inset={24}
          loop={false}
          draggable
          onChange={(i) => { moved.current = true; setPicked(values[i]); }}
        />
      </div>
      {error && <p className="text-sm text-accent-extreme" role="alert">{error}</p>}
    </ClockPopup>
  );
}
