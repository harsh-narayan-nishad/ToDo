/**
 * The same real-life rules the server enforces (backend/src/modules/todo/todo.compute.ts), checked here first
 * so the form can say what is wrong right away. The server stays the authority: it also checks the things
 * this page cannot see, such as overlaps with time logged from another device.
 */
import { addDays, localDay } from "@/lib/days";

/** Each day is filled in on that day only; once it is over, its tasks and time are locked (see lockedProblem). */
export const BACKFILL_DAYS = 0;
export const MIN_TIMED_MINUTES = 5;
const DAY_MINUTES = 24 * 60;

const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
/** Whole days from a to b (both "YYYY-MM-DD"). */
const diff = (a: string, b: string) => Math.round((Date.UTC(+b.slice(0, 4), +b.slice(5, 7) - 1, +b.slice(8, 10)) - Date.UTC(+a.slice(0, 4), +a.slice(5, 7) - 1, +a.slice(8, 10))) / 86_400_000);

export function nowLocal(): { day: string; minutes: number } {
  const d = new Date();
  return { day: localDay(d), minutes: d.getHours() * 60 + d.getMinutes() };
}

/** Earliest start day a new task may have. */
export const earliestStart = (today: string) => addDays(today, -BACKFILL_DAYS);

export function titleProblem(title: string): string | null {
  if (!title.trim()) return "Give the task a title.";
  return /[\p{L}\p{N}]/u.test(title) ? null : "The title needs at least one letter or number.";
}

export interface Plan { startDay: string; dueDay: string; startTime: string | null; endTime: string | null }

export function planProblem(p: Plan, now = nowLocal(), check = { start: true, due: true }): string | null {
  if (diff(p.startDay, p.dueDay) < 0) return "The due day must be on or after the start day.";
  if (check.due && diff(now.day, p.dueDay) < 0) return "The due day cannot be in the past.";
  if (check.start && diff(p.startDay, now.day) > BACKFILL_DAYS) return BACKFILL_DAYS === 0 ? "The start day cannot be in the past." : `The start day can be at most ${BACKFILL_DAYS} days ago.`;
  if (!p.startTime !== !p.endTime) return "Pick a start and an end time, or tick All day.";
  if (p.startTime && p.endTime) {
    const span = diff(p.startDay, p.dueDay) * DAY_MINUTES + toMin(p.endTime) - toMin(p.startTime);
    if (p.startDay === p.dueDay && span <= 0) return "The end time must be after the start time.";
    if (span < MIN_TIMED_MINUTES) return `A timed task must last at least ${MIN_TIMED_MINUTES} minutes.`;
    if (check.due && p.dueDay === now.day && toMin(p.endTime) <= now.minutes) return "That time has already passed today. Pick a later end time.";
  }
  return null;
}

/** A task whose day is over is read-only: finished on an earlier day, or still open after its due day. */
export function lockedProblem(task: { status: string; dueDay: string; completedDay: string | null }, today = localDay()): string | null {
  if (task.status === "done" && task.completedDay && task.completedDay < today) return "Finished on an earlier day. Past days are locked.";
  if (task.status !== "done" && task.dueDay < today) return "Its day is over. Past days are locked.";
  return null;
}

/** Days work can be logged for: today only (BACKFILL_DAYS), but not after the day a finished task was finished. */
export function loggableDays(task: { status: string; completedDay: string | null }, today = localDay()): string[] {
  const days = Array.from({ length: BACKFILL_DAYS + 1 }, (_, i) => addDays(today, -i));
  return task.status === "done" && task.completedDay ? days.filter((d) => d <= (task.completedDay as string)) : days;
}

export function logProblem(req: { day: string; minutes: number; startTime?: string | null }, now = nowLocal()): string | null {
  if (req.minutes < 1) return "Enter at least 1 minute.";
  if (req.minutes > 16 * 60) return "At most 16 hours in one entry.";
  if (req.day === now.day && req.minutes > now.minutes) return "You cannot log more time today than has passed since midnight.";
  if (req.startTime) {
    const end = toMin(req.startTime) + req.minutes;
    if (end > DAY_MINUTES) return "A block must end the same day. Split it across two days.";
    if (req.day === now.day && end > now.minutes) return "That block ends in the future. Log it once you have done the work.";
  }
  return null;
}
