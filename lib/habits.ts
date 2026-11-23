import { api } from "@/lib/api";
import { addDays, today, tzOffset } from "@/lib/days";
import { weekday } from "@/lib/repeat";

/**
 * The habit tracker: micro to macro habits, sleep included (backend/src/modules/todo/habit.*).
 *  - check: done or not · count: e.g. 8 glasses · duration: minutes · sleep: bed and wake time · quit: a habit to break,
 *    ticked on each day it was avoided;
 *  - scale: micro (tiny, under two minutes) → daily → macro (big, long-term);
 *  - only today can be checked in; past days are locked, like tasks.
 */
export type HabitKind = "check" | "count" | "duration" | "sleep" | "quit";
export type HabitScale = "micro" | "daily" | "macro";
export type HabitCategory = "health" | "fitness" | "mind" | "sleep" | "learning" | "work" | "social" | "finance" | "home" | "spiritual" | "other";

export interface Habit {
  id: string;
  name: string;
  kind: HabitKind;
  scale: HabitScale;
  category: HabitCategory;
  target: number;
  unit: string;
  /** 0 = Monday … 6 = Sunday. */
  days: number[];
  cue: string;
  /** Optional time of day ("HH:MM"); null / missing = any time. */
  time?: string | null;
  startDay: string;
  archived: boolean;
  createdAt: string;
}
export interface HabitEntry { id: string; habitId: string; day: string; value: number; bedTime: string | null; wakeTime: string | null; quality: number | null; note: string; skipped?: boolean }
export interface HabitInput { name: string; kind: HabitKind; scale: HabitScale; category: HabitCategory; target: number; unit: string; days: number[]; cue: string; time?: string | null }

export const KINDS: { id: HabitKind; label: string; hint: string }[] = [
  { id: "check", label: "Yes / no", hint: "Done or not, e.g. make the bed" },
  { id: "count", label: "Count", hint: "How many, e.g. 8 glasses of water" },
  { id: "duration", label: "Time", hint: "How long, e.g. read 20 minutes" },
  { id: "quit", label: "Quit", hint: "A habit to break: tick each day you avoided it" },
  { id: "sleep", label: "Sleep", hint: "Bed time, wake time and how well you slept" },
];
export const SCALES: { id: HabitScale; label: string; hint: string }[] = [
  { id: "micro", label: "Micro", hint: "Tiny, under two minutes" },
  { id: "daily", label: "Daily", hint: "A normal everyday habit" },
  { id: "macro", label: "Macro", hint: "Big, long-term goal" },
];
export const CATEGORIES: { id: HabitCategory; label: string }[] = [
  { id: "health", label: "Health" }, { id: "fitness", label: "Fitness" }, { id: "mind", label: "Mind" }, { id: "sleep", label: "Sleep" },
  { id: "learning", label: "Learning" }, { id: "work", label: "Work" }, { id: "social", label: "Social" }, { id: "finance", label: "Finance" },
  { id: "home", label: "Home" }, { id: "spiritual", label: "Spiritual" }, { id: "other", label: "Other" },
];
export const kindLabel = (k: HabitKind) => KINDS.find((x) => x.id === k)?.label ?? k;
export const scaleLabel = (s: HabitScale) => SCALES.find((x) => x.id === s)?.label ?? s;
export const categoryLabel = (c: HabitCategory) => CATEGORIES.find((x) => x.id === c)?.label ?? c;

export const WEEK = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
export const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];
/** "Every day", "Weekdays", "Weekends" or "Mon, Wed, Fri". */
export function daysLabel(days: number[]): string {
  const k = [...days].sort().join("");
  if (k === "0123456") return "Every day";
  if (k === "01234") return "Weekdays";
  if (k === "56") return "Weekends";
  return [...days].sort().map((d) => WEEK[d]).join(", ");
}

/** Ready-made habits, micro to macro, to start from in the New habit panel. */
export const TEMPLATES: (HabitInput & { scale: HabitScale })[] = [
  { name: "Drink a glass of water on waking", kind: "check", scale: "micro", category: "health", target: 1, unit: "", days: ALL_DAYS, cue: "Right after I wake up" },
  { name: "Make the bed", kind: "check", scale: "micro", category: "home", target: 1, unit: "", days: ALL_DAYS, cue: "As soon as I get up" },
  { name: "Floss", kind: "check", scale: "micro", category: "health", target: 1, unit: "", days: ALL_DAYS, cue: "After brushing at night" },
  { name: "Take vitamins", kind: "check", scale: "micro", category: "health", target: 1, unit: "", days: ALL_DAYS, cue: "With breakfast" },
  { name: "Two-minute tidy", kind: "duration", scale: "micro", category: "home", target: 2, unit: "", days: ALL_DAYS, cue: "" },
  { name: "Write one line of gratitude", kind: "check", scale: "micro", category: "mind", target: 1, unit: "", days: ALL_DAYS, cue: "Before bed" },
  { name: "Drink water", kind: "count", scale: "daily", category: "health", target: 8, unit: "glasses", days: ALL_DAYS, cue: "" },
  { name: "Walk", kind: "count", scale: "daily", category: "fitness", target: 8000, unit: "steps", days: ALL_DAYS, cue: "" },
  { name: "Read", kind: "duration", scale: "daily", category: "learning", target: 20, unit: "", days: ALL_DAYS, cue: "After dinner" },
  { name: "Meditate", kind: "duration", scale: "daily", category: "mind", target: 10, unit: "", days: ALL_DAYS, cue: "Before work" },
  { name: "Journal", kind: "check", scale: "daily", category: "mind", target: 1, unit: "", days: ALL_DAYS, cue: "" },
  { name: "Sleep", kind: "sleep", scale: "daily", category: "sleep", target: 480, unit: "", days: ALL_DAYS, cue: "Screens off 30 minutes before bed" },
  { name: "No sugar", kind: "quit", scale: "daily", category: "health", target: 1, unit: "", days: ALL_DAYS, cue: "" },
  { name: "No phone in the first hour", kind: "quit", scale: "daily", category: "mind", target: 1, unit: "", days: ALL_DAYS, cue: "" },
  { name: "No smoking", kind: "quit", scale: "daily", category: "health", target: 1, unit: "", days: ALL_DAYS, cue: "" },
  { name: "Workout", kind: "duration", scale: "macro", category: "fitness", target: 45, unit: "", days: [0, 2, 4], cue: "" },
  { name: "Deep work", kind: "duration", scale: "macro", category: "work", target: 120, unit: "", days: [0, 1, 2, 3, 4], cue: "Phone in another room" },
  { name: "Learn a new skill", kind: "duration", scale: "macro", category: "learning", target: 60, unit: "", days: [0, 1, 2, 3, 4], cue: "" },
  { name: "Save money", kind: "count", scale: "macro", category: "finance", target: 500, unit: "₹", days: ALL_DAYS, cue: "" },
  { name: "Weekly review", kind: "check", scale: "macro", category: "work", target: 1, unit: "", days: [6], cue: "Sunday evening" },
  { name: "Call family", kind: "check", scale: "macro", category: "social", target: 1, unit: "", days: [6], cue: "" },
];

const stamp = () => ({ today: today(), tzOffset: tzOffset() });
const enc = encodeURIComponent;
export const habitApi = {
  list: () => api<Habit[]>("/todo/habits"),
  create: (input: HabitInput) => api<Habit>("/todo/habits", { method: "POST", body: { ...input, ...stamp() } }),
  update: (id: string, patch: Partial<Omit<HabitInput, "kind">> & { archived?: boolean }) => api<Habit>(`/todo/habits/${enc(id)}`, { method: "PATCH", body: patch }),
  remove: (id: string) => api<void>(`/todo/habits/${enc(id)}`, { method: "DELETE" }),
  entries: (from: string, to: string) => api<HabitEntry[]>("/todo/habits/entries", { query: { from, to } }),
  /** Returns null when a count / time of 0 removed the entry. */
  set: (id: string, day: string, body: { skip?: boolean; value?: number; bedTime?: string; wakeTime?: string; quality?: number | null; note?: string }) =>
    api<HabitEntry | undefined>(`/todo/habits/${enc(id)}/entries/${day}`, { method: "POST", body: { ...body, ...stamp() } }).then((e) => e ?? null),
  clear: (id: string, day: string) => api<void>(`/todo/habits/${enc(id)}/entries/${day}`, { method: "DELETE", query: stamp() }),
};

// ---- maths: what counts as done, streaks, scores ----

/** check / quit are done with any entry; the others when the goal is reached. */
export const goal = (h: Habit) => (h.kind === "check" || h.kind === "quit" ? 1 : h.target);
export const progress = (h: Habit, e?: HabitEntry | null) => (e && !e.skipped ? Math.min(1, e.value / goal(h)) : 0);
export const isDone = (h: Habit, e?: HabitEntry | null) => !!e && !e.skipped && e.value >= goal(h);
/** Skipped on purpose: neither done nor missed (streaks and scores pass over it). */
export const isSkipped = (e?: HabitEntry | null) => !!e?.skipped;
export type HabitStatus = "completed" | "skipped" | "in-progress" | "pending";
/** Today's status of a habit, like a task's: completed, skipped, in progress (part of a count or time) or still to do. */
export function habitStatus(h: Habit, e?: HabitEntry | null): HabitStatus {
  if (isSkipped(e)) return "skipped";
  if (isDone(h, e)) return "completed";
  return progress(h, e) > 0 ? "in-progress" : "pending";
}
export const STATUS_LABEL: Record<HabitStatus, string> = { completed: "Completed", skipped: "Skipped", "in-progress": "In progress", pending: "To do" };
/** Planned for this day: one of its weekdays, and not before it was added. */
export const isPlanned = (h: Habit, day: string) => day >= h.startDay && h.days.includes(weekday(day));
/** Planned for this day and not skipped: what "x of y done" counts. */
export const isDue = (h: Habit, day: string, e?: HabitEntry | null) => isPlanned(h, day) && !isSkipped(e);

/** entries → habitId → day → entry. */
export type EntryIndex = Map<string, Map<string, HabitEntry>>;
export function indexEntries(entries: HabitEntry[]): EntryIndex {
  const m: EntryIndex = new Map();
  for (const e of entries) {
    if (!m.has(e.habitId)) m.set(e.habitId, new Map());
    m.get(e.habitId)!.set(e.day, e);
  }
  return m;
}

/**
 * Planned days in a row that were done, counting back from today. Days the habit is not planned for are skipped
 * (a Mon/Wed/Fri habit keeps its streak over Tuesday). Today only counts once done: not yet done today does not
 * break the streak.
 */
export function currentStreak(h: Habit, byDay: Map<string, HabitEntry> | undefined, now = today()): number {
  let n = 0;
  for (let d = now; d >= h.startDay; d = addDays(d, -1)) {
    if (!isPlanned(h, d) || isSkipped(byDay?.get(d))) continue;
    if (isDone(h, byDay?.get(d))) n++;
    else if (d !== now) break;
  }
  return n;
}

export function bestStreak(h: Habit, byDay: Map<string, HabitEntry> | undefined, now = today()): number {
  let best = 0;
  let run = 0;
  for (let d = h.startDay; d <= now; d = addDays(d, 1)) {
    if (!isPlanned(h, d) || isSkipped(byDay?.get(d))) continue;
    if (isDone(h, byDay?.get(d))) best = Math.max(best, ++run);
    else if (d !== now) run = 0;
  }
  return best;
}

/** Share of planned days done in the last `n` days (today counts only once done). null = no planned day yet. */
export function successRate(h: Habit, byDay: Map<string, HabitEntry> | undefined, n = 30, now = today()): number | null {
  let planned = 0;
  let done = 0;
  const from = addDays(now, -(n - 1));
  for (let d = from > h.startDay ? from : h.startDay; d <= now; d = addDays(d, 1)) {
    if (!isPlanned(h, d) || isSkipped(byDay?.get(d))) continue;
    const ok = isDone(h, byDay?.get(d));
    if (d === now && !ok) continue;
    planned++;
    if (ok) done++;
  }
  return planned ? done / planned : null;
}

/** "8 glasses", "20 min", "8 h", or "" for yes / no. */
export function goalLabel(h: Habit): string {
  if (h.kind === "count") return `${h.target.toLocaleString()}${h.unit ? ` ${h.unit}` : ""}`;
  if (h.kind === "duration") return minutesLabel(h.target);
  if (h.kind === "sleep") return minutesLabel(h.target);
  return "";
}
/** 450 → "7 h 30 min", 45 → "45 min". */
export function minutesLabel(m: number): string {
  const h = Math.floor(m / 60);
  const r = Math.round(m % 60);
  if (!h) return `${r} min`;
  return r ? `${h} h ${r} min` : `${h} h`;
}
/** Sleep from bed to wake time, across midnight. */
export function sleepMinutes(bed: string, wake: string): number {
  const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
  const diff = toMin(wake) - toMin(bed);
  return diff > 0 ? diff : diff + 24 * 60;
}
/** The average time of day of several "HH:MM" times around midnight (23:30 and 00:30 average to 00:00, not noon). */
export function averageClock(times: string[]): string | null {
  if (!times.length) return null;
  let x = 0;
  let y = 0;
  for (const t of times) {
    const a = ((Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5))) / 1440) * 2 * Math.PI;
    x += Math.cos(a);
    y += Math.sin(a);
  }
  let m = Math.round((Math.atan2(y, x) / (2 * Math.PI)) * 1440);
  if (m < 0) m += 1440;
  m = (m + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}
