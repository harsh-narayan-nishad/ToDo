import { api, ApiError } from "@/lib/api";
import { today, tzOffset } from "@/lib/days";

export type Priority = "low" | "medium" | "high";
export type ContestPlatform = "leetcode" | "codeforces" | "atcoder" | "codechef" | "gfg";
export const CONTEST_PLATFORMS: { id: ContestPlatform; label: string }[] = [
  { id: "leetcode", label: "LeetCode" }, { id: "codeforces", label: "Codeforces" }, { id: "atcoder", label: "AtCoder" }, { id: "codechef", label: "CodeChef" }, { id: "gfg", label: "GeeksforGeeks" },
];

export interface Task {
  id: string;
  title: string;
  notes: string;
  priority: Priority;
  status: "open" | "done";
  startDay: string;
  dueDay: string;
  /** "HH:MM" or null (all-day). */
  startTime: string | null;
  endTime: string | null;
  createdDay: string;
  completedDay: string | null;
  createdAt: string;
  loggedMinutes?: number;
}

export interface WorkLog { id: string; taskId: string; taskTitle: string; day: string; minutes: number; note: string; startTime: string | null; createdAt: string }

export interface HeatDay { day: string; minutes: number; created: number; completed: number; level: 0 | 1 | 2 | 3 | 4 }

export interface Summary {
  totals: { created: number; completed: number; open: number; overdue: number; minutes: number; hours: number; workedDays: number; avgMinutesPerWorkedDay: number };
  consistency: {
    currentStreak: number;
    longestStreak: number;
    activeDays: number;
    last30ActiveDays: number;
    todayActive: boolean;
    last7Days: { day: string; readMs: number; active: boolean }[];
    level: number;
    label: string;
    percent: number;
  };
  heatmap: HeatDay[];
  backfillDays: number;
}

export interface DayDetail { day: string; minutes: number; created: Task[]; completed: Task[]; planned: Task[]; logs: WorkLog[] }

/** A task title this person has added before (one per title), with what it was last added with. */
export interface Entry { id: string; title: string; notes: string; priority: Priority; startTime: string | null; endTime: string | null; created: number; done: number; lastUsedAt: string }

export interface TaskInput { title: string; notes: string; priority: Priority; startDay: string; dueDay: string; startTime: string | null; endTime: string | null }

/** Every write sends the user's own day and time-zone offset; see backend/src/modules/todo. */
const stamp = () => ({ today: today(), tzOffset: tzOffset() });

export const todoApi = {
  tasks: () => api<Task[]>("/todo/tasks"),
  create: (input: TaskInput) => api<Task>("/todo/tasks", { method: "POST", body: { ...input, ...stamp() } }),
  update: (id: string, patch: Partial<TaskInput> & { status?: Task["status"] }) =>
    api<Task>(`/todo/tasks/${encodeURIComponent(id)}`, { method: "PATCH", body: { ...patch, ...stamp() } }),
  remove: (id: string) => api<void>(`/todo/tasks/${encodeURIComponent(id)}`, { method: "DELETE" }),
  /** `startTime` ("HH:MM") is optional; with it the work also appears as a block in the Pacewise calendar. */
  logWork: (id: string, day: string, minutes: number, note: string, startTime?: string) =>
    api<WorkLog>(`/todo/tasks/${encodeURIComponent(id)}/logs`, { method: "POST", body: { day, minutes, note, ...(startTime ? { startTime } : {}), today: today(), tzOffset: tzOffset() } }),
  logs: (from?: string, to?: string) => api<WorkLog[]>("/todo/logs", { query: { from, to } }),
  removeLog: (id: string) => api<void>(`/todo/logs/${encodeURIComponent(id)}`, { method: "DELETE", query: { today: today() } }),
  summary: () => api<Summary>("/todo/summary", { query: { today: today() } }),
  /** Coding contests as tasks: which platforms are on (opening also adds any new contests), and switching one on / off. */
  contests: () => api<{ platforms: ContestPlatform[]; added: number }>("/todo/contests", { query: { tzOffset: String(tzOffset()) } }),
  setContests: (platform: ContestPlatform, enabled: boolean) =>
    api<{ platforms: ContestPlatform[]; added: number; removed: number }>("/todo/contests", { method: "POST", body: { platform, enabled, tzOffset: tzOffset() } }),
  day: (day: string) => api<DayDetail>(`/todo/days/${day}`),
  /** My entries; a backend from before entries has no /todo/entries (404): then there are none. */
  entries: () => api<Entry[]>("/todo/entries").catch((e) => { if (e instanceof ApiError && e.status === 404) return [] as Entry[]; throw e; }),
};

export interface BulkResult { created: Task[]; skipped: { index: number; title: string; startDay: string; reason: string }[] }
/**
 * The task planner: many tasks in one request (max 200). Tasks that break a rule are skipped with the reason.
 * A backend from before the planner has no /todo/tasks/bulk (404): then the tasks are added one by one through the
 * normal endpoint, which mirrors each into the calendar the same way.
 */
export async function createBulk(tasks: TaskInput[]): Promise<BulkResult> {
  try {
    return await api<BulkResult>("/todo/tasks/bulk", { method: "POST", body: { tasks, today: today(), tzOffset: tzOffset() } });
  } catch (e) {
    if (!(e instanceof ApiError) || e.status !== 404) throw e;
  }
  const result: BulkResult = { created: [], skipped: [] };
  for (const [index, t] of tasks.entries()) {
    try {
      result.created.push(await todoApi.create(t));
    } catch (e) {
      if (e instanceof ApiError && (e.status === 0 || e.status === 401)) throw e; // offline or signed out: stop
      result.skipped.push({ index, title: t.title, startDay: t.startDay, reason: e instanceof Error ? e.message : "Could not add this task." });
    }
  }
  return result;
}
