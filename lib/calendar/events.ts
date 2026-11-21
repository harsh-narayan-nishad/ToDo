import { api } from "@/lib/api";

/**
 * The Pacewise calendar's events (Pacewise lib/calendar/events.ts + its calendarApi), for To-do's copy of the calendar.
 * To-do is always signed in to the backend, so events are read and written there directly: the same MongoDB events
 * Pacewise shows, To-do tasks ("todo-…") and logged work ("todolog-…") included.
 */
export type CalendarVariant = "primary" | "secondary" | "outline";
export interface CalendarItem { id: string; title: string; start: string; end: string; allDay: boolean; variant: CalendarVariant }
export interface CalendarEventInput { title?: string; start?: string; end?: string; allDay?: boolean; variant?: CalendarVariant; /** New entries become To-do tasks on the user's own days. */ tzOffset?: number }

const path = (id: string) => `/calendar/events/${encodeURIComponent(id)}`;

export async function loadEvents(_userId: string): Promise<CalendarItem[]> {
  return api<CalendarItem[]>("/calendar/events");
}
export async function addEvent(_userId: string, input: CalendarEventInput & { title: string; start: string; end: string }): Promise<CalendarItem> {
  return api<CalendarItem>("/calendar/events", { method: "POST", body: input });
}
export async function changeEvent(_userId: string, id: string, patch: CalendarEventInput): Promise<void> {
  await api<CalendarItem>(path(id), { method: "PATCH", body: patch });
}
export async function removeEvent(_userId: string, id: string): Promise<void> {
  await api<void>(path(id), { method: "DELETE" });
}
