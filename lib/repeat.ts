import { addDays } from "@/lib/days";

/**
 * How a planned task repeats between the plan's first and last day. Shared by the planner's Repeat dropdown,
 * the sheet's per-task Repeat column, and CSV import.
 *  - patterns: never (once, on the first day), every day, weekdays, weekends, picked weekdays, once a week, once a month;
 *  - intervals: every 2nd … 7th day, counted from the first day.
 */
export type Interval = "every-2" | "every-3" | "every-4" | "every-5" | "every-6" | "every-7";
export type Repeat = "never" | "daily" | "weekdays" | "weekends" | "custom" | "weekly" | "monthly" | Interval;

export const PATTERNS: { id: Repeat; label: string }[] = [
  { id: "never", label: "Never" },
  { id: "daily", label: "Every day" },
  { id: "weekdays", label: "Weekdays" },
  { id: "weekends", label: "Weekends" },
  { id: "custom", label: "Pick days" },
  { id: "weekly", label: "Once a week" },
  { id: "monthly", label: "Once a month" },
];
const ORD = ["", "", "2nd", "3rd", "4th", "5th", "6th", "7th"];
export const INTERVALS: { id: Interval; label: string }[] = [2, 3, 4, 5, 6, 7].map((n) => ({ id: `every-${n}` as Interval, label: `Every ${ORD[n]} day` }));
export const repeatLabel = (r: Repeat) => [...PATTERNS, ...INTERVALS].find((x) => x.id === r)?.label ?? "Every day";

/** A plan (and a repeating task) can run for up to two years. */
export const MAX_RANGE_DAYS = 730;
const parse = (day: string) => { const [y, m, d] = day.split("-").map(Number); return new Date(y, m - 1, d, 12); };
/** 0 = Monday … 6 = Sunday. */
export const weekday = (day: string) => (parse(day).getDay() + 6) % 7;
export const span = (a: string, b: string) => Math.round((parse(b).getTime() - parse(a).getTime()) / 86_400_000);

/** Every day from `from` to `to` that the repeat rule keeps. `picked` = the weekdays for "custom" (Mon … Sun). */
export function planDays(from: string, to: string, repeat: Repeat, picked: boolean[]): string[] {
  const n = span(from, to);
  if (n < 0 || n > MAX_RANGE_DAYS) return [];
  if (repeat === "never") return [from];
  const every = repeat.startsWith("every-") ? Number(repeat.slice(6)) : 0;
  const startDow = weekday(from);
  const startDate = parse(from).getDate();
  const out: string[] = [];
  for (let i = 0; i <= n; i++) {
    const d = addDays(from, i);
    const w = weekday(d);
    const keep =
      every ? i % every === 0
      : repeat === "daily" ? true
      : repeat === "weekdays" ? w < 5
      : repeat === "weekends" ? w >= 5
      : repeat === "custom" ? picked[w]
      : repeat === "weekly" ? w === startDow
      : parse(d).getDate() === startDate;
    if (keep) out.push(d);
  }
  return out;
}

/** A Repeat cell from a sheet: "daily", "every day", "every 3 days", "every 3rd day", "3", "weekdays", "weekly", … ; else null. */
export function parseRepeat(raw: string): Repeat | null {
  const v = raw.trim().toLowerCase();
  if (!v) return null;
  const n = v.match(/^(?:every\s*)?(\d)(?:st|nd|rd|th)?(?:\s*days?)?$/);
  if (n) return Number(n[1]) === 1 ? "daily" : Number(n[1]) >= 2 && Number(n[1]) <= 7 ? (`every-${n[1]}` as Interval) : null;
  if (/^(never|no ?repeat|none|once)$/.test(v)) return "never";
  if (/^(daily|every ?day|everyday)$/.test(v)) return "daily";
  if (/^(weekdays?|mon-fri|workdays?)$/.test(v)) return "weekdays";
  if (/^weekends?$/.test(v)) return "weekends";
  if (/^(weekly|once a week|every week)$/.test(v)) return "weekly";
  if (/^(monthly|once a month|every month)$/.test(v)) return "monthly";
  if (/^(every other day|alternate days?)$/.test(v)) return "every-2";
  return null;
}
