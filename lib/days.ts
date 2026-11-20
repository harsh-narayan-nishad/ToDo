/**
 * Calendar-day helpers. A "day" is "YYYY-MM-DD" in THIS browser's time zone; the server never guesses it,
 * so a late-night task counts for the day the user sees on their own clock.
 */
const pad = (n: number) => String(n).padStart(2, "0");

export function localDay(d = new Date()): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Noon avoids daylight-saving edges when stepping days. */
const parse = (day: string) => {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(y, m - 1, d, 12);
};

export function addDays(day: string, n: number): string {
  const d = parse(day);
  d.setDate(d.getDate() + n);
  return localDay(d);
}

export const today = () => localDay();
export const tzOffset = () => new Date().getTimezoneOffset();

export function dayLabel(day: string, now = today()): string {
  if (day === now) return "Today";
  if (day === addDays(now, -1)) return "Yesterday";
  if (day === addDays(now, 1)) return "Tomorrow";
  return parse(day).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
}

export function longDay(day: string): string {
  return parse(day).toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}

export function rangeLabel(start: string, due: string): string {
  return start === due ? dayLabel(due) : `${dayLabel(start)} → ${dayLabel(due)}`;
}

/** 135 → "2 h 15 min", 45 → "45 min", 0 → "0 min". */
export function duration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

/** "14:30" → "2:30 PM" (or "14:30", following the browser's locale). */
export function clock(time: string): string {
  const [h, m] = time.split(":").map(Number);
  return new Date(2000, 0, 1, h, m).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

/** "14:30" plus 90 min → "16:00" (stops at 23:59). */
export function addMinutesToTime(time: string, minutes: number): string {
  const [h, m] = time.split(":").map(Number);
  const total = Math.min(23 * 60 + 59, h * 60 + m + minutes);
  return `${pad(Math.floor(total / 60))}:${pad(total % 60)}`;
}

/** "Today, 10:00 AM – 11:30 AM", "Mon 17 Nov 10:00 PM → Tomorrow 2:00 AM", or the plain day range when there is no time. */
export function whenLabel(startDay: string, dueDay: string, startTime: string | null, endTime: string | null): string {
  if (!startTime || !endTime) return rangeLabel(startDay, dueDay);
  if (startDay === dueDay) return `${dayLabel(startDay)}, ${clock(startTime)} – ${clock(endTime)}`;
  return `${dayLabel(startDay)} ${clock(startTime)} → ${dayLabel(dueDay)} ${clock(endTime)}`;
}
