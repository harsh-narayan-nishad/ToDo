"use client";
import type { Task } from "@/lib/todo";

/** Open tasks for today, scheduled later, overdue, and all open ones (the first three add up to the last). */
export function taskCounts(tasks: Task[], now: string) {
  const open = tasks.filter((t) => t.status === "open");
  return {
    today: open.filter((t) => t.startDay <= now && t.dueDay >= now).length,
    scheduled: open.filter((t) => t.startDay > now).length,
    overdue: open.filter((t) => t.dueDay < now).length,
    all: open.length,
  };
}
