import { api } from "@/lib/api";
import { addDays, today, tzOffset } from "@/lib/days";

/**
 * Goals with a deadline: something to reach this week, month, quarter or year (backend modules/todo/goals.*). Tasks are
 * linked to a goal when they are added or edited; a goal's progress is its finished tasks out of all of them, and the
 * person marks it reached.
 */
/** "long": a long-term goal (any deadline, up to ten years ahead). */
export type GoalPeriod = "week" | "month" | "quarter" | "year" | "long";
export interface Goal {
  id: string;
  title: string;
  notes: string;
  /** The person's review: what went well, mistakes, failures, what to do differently. */
  review?: string;
  period: GoalPeriod;
  startDay: string;
  /** The deadline ("YYYY-MM-DD"). */
  dueDay: string;
  status: "open" | "done";
  completedDay: string | null;
  createdAt: string;
  /** Linked tasks: how many, and how many are finished. */
  tasks: { total: number; done: number };
  /** Time planned for the linked tasks (their start to end times) and logged on them, in minutes. */
  time?: { plannedMinutes: number; loggedMinutes: number };
}
/** A goal's report, like a project tracker's: its tasks with planned and logged time, and the work logged on them. */
export interface GoalReport {
  goal: Goal;
  firstActivityDay: string | null;
  lastActivityDay: string | null;
  tasks: { id: string; title: string; status: "open" | "done"; priority: string; startDay: string; dueDay: string; startTime: string | null; endTime: string | null; completedDay: string | null; plannedMinutes: number; loggedMinutes: number }[];
  logs: { id: string; taskId: string; taskTitle: string; day: string; minutes: number; note: string; startTime: string | null }[];
}
export interface GoalInput { title: string; notes: string; review?: string; period: GoalPeriod; dueDay: string }

/** `short`: the name in a segmented control, where five must fit side by side on a phone. */
export const PERIODS: { id: GoalPeriod; label: string; short: string; hint: string }[] = [
  { id: "week", label: "Weekly", short: "Week", hint: "Reach it by the end of this week" },
  { id: "month", label: "Monthly", short: "Month", hint: "Reach it by the end of this month" },
  { id: "quarter", label: "Quarterly", short: "Quarter", hint: "Reach it by the end of this quarter" },
  { id: "year", label: "Yearly", short: "Year", hint: "Reach it by the end of this year" },
  { id: "long", label: "Long-term", short: "Long", hint: "A bigger goal: pick any deadline, up to ten years ahead" },
];
export const periodLabel = (p: GoalPeriod) => PERIODS.find((x) => x.id === p)?.label ?? p;

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
/** The last day of the current week (Sunday), month, quarter or year: a goal's deadline unless one is picked. */
export function periodEnd(p: GoalPeriod, day = today()): string {
  const [y, m, d] = day.split("-").map(Number);
  const date = new Date(y, m - 1, d, 12);
  if (p === "week") return addDays(day, 6 - ((date.getDay() + 6) % 7));
  if (p === "month") return iso(new Date(y, m, 0, 12));
  if (p === "quarter") return iso(new Date(y, Math.floor((m - 1) / 3) * 3 + 3, 0, 12));
  if (p === "long") return iso(new Date(y + 1, m - 1, d, 12));
  return `${y}-12-31`;
}

export const span = (a: string, b: string) => Math.round((new Date(b + "T12:00").getTime() - new Date(a + "T12:00").getTime()) / 86_400_000);
/** "Due today", "3 days left", "2 days overdue", or "Reached". */
export function deadlineLabel(g: Goal, now = today()): { text: string; tone: "ok" | "soon" | "late" | "done" } {
  if (g.status === "done") return { text: "Reached", tone: "done" };
  const n = span(now, g.dueDay);
  if (n < 0) return { text: `${-n} day${n === -1 ? "" : "s"} overdue`, tone: "late" };
  if (n === 0) return { text: "Due today", tone: "soon" };
  return { text: `${n} day${n === 1 ? "" : "s"} left`, tone: n <= 2 ? "soon" : "ok" };
}

const stamp = () => ({ today: today(), tzOffset: tzOffset() });
const enc = encodeURIComponent;
export const goalsApi = {
  list: () => api<Goal[]>("/todo/goals"),
  report: (id: string) => api<GoalReport>(`/todo/goals/${enc(id)}/report`),
  create: (input: GoalInput) => api<Goal>("/todo/goals", { method: "POST", body: { ...input, ...stamp() } }),
  update: (id: string, patch: Partial<GoalInput> & { status?: Goal["status"] }) => api<Goal>(`/todo/goals/${enc(id)}`, { method: "PATCH", body: { ...patch, ...stamp() } }),
  remove: (id: string) => api<void>(`/todo/goals/${enc(id)}`, { method: "DELETE" }),
};
