import { api } from "@/lib/api";
import { today, tzOffset } from "@/lib/days";

export type Priority = "low" | "medium" | "high";

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
  day: (day: string) => api<DayDetail>(`/todo/days/${day}`),
};
