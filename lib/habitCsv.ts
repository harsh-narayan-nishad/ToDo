import { parseTable, parseTime } from "@/components/TaskSheet";
import { ALL_DAYS, CATEGORIES, type Habit, type HabitCategory, type HabitInput, type HabitKind, type HabitScale } from "@/lib/habits";

/**
 * Habits from a CSV / TSV, imported in the Habits tab (tasks have their own CSV in the Tasks tab).
 * The first row is a header; columns are matched by name, in any order:
 *   Name, Type (Yes/no, Count, Time, Quit, Sleep), Size (Micro, Daily, Macro), Category, Goal, Unit,
 *   Days (Every day, Weekdays, Weekends or "Mon, Wed, Fri"), Time, Cue.
 * Only Name is needed; the rest falls back to what the New habit panel starts with.
 */
type HCol = "name" | "kind" | "scale" | "category" | "target" | "unit" | "days" | "time" | "cue";
const HEADERS: Record<HCol, RegExp> = {
  name: /^(name|habit|habit name|title)$/i,
  kind: /^(type|kind|tracking|track)$/i,
  scale: /^(size|scale|level)$/i,
  category: /^(category|area|group)$/i,
  target: /^(goal|target|amount)$/i,
  unit: /^(unit|units)$/i,
  days: /^(days|repeat|weekdays|schedule|on)$/i,
  time: /^(time|at|time of day)$/i,
  cue: /^(cue|trigger|notes?|when)$/i,
};

const parseKind = (raw: string): HabitKind | null => {
  const v = raw.trim().toLowerCase();
  if (!v) return null;
  if (/^(yes ?\/? ?no|check|done|tick|boolean)$/.test(v)) return "check";
  if (/^(count|number|amount|times)$/.test(v)) return "count";
  if (/^(time|duration|minutes?|mins?|timer)$/.test(v)) return "duration";
  if (/^(quit|break|avoid|stop)$/.test(v)) return "quit";
  if (/^sleep$/.test(v)) return "sleep";
  return null;
};
const parseScale = (raw: string): HabitScale | null => {
  const v = raw.trim().toLowerCase();
  return v === "micro" || v === "daily" || v === "macro" ? v : null;
};
const parseCategory = (raw: string): HabitCategory | null => {
  const v = raw.trim().toLowerCase();
  return CATEGORIES.find((c) => c.id === v || c.label.toLowerCase() === v)?.id ?? null;
};
/** "Every day", "Daily", "Weekdays", "Weekends", "Mon, Wed, Fri" → 0 = Monday … 6 = Sunday; null if none. */
const parseDays = (raw: string): number[] | null => {
  const v = raw.trim().toLowerCase();
  if (!v) return null;
  if (/^(every ?day|everyday|daily|all|all days)$/.test(v)) return ALL_DAYS;
  if (/^(weekdays?|mon-fri|workdays?)$/.test(v)) return [0, 1, 2, 3, 4];
  if (/^weekends?$/.test(v)) return [5, 6];
  const names = ["mo", "tu", "we", "th", "fr", "sa", "su"];
  const out = new Set<number>();
  v.split(/[\s,;|/]+/).forEach((w) => { const i = names.indexOf(w.slice(0, 2)); if (i >= 0) out.add(i); });
  return out.size ? [...out].sort() : null;
};
/** "20", "20 min", "1 h", "1h 30m", "7.5 hours" → minutes; null if unreadable. */
const parseMinutes = (raw: string, bareIsHours: boolean): number | null => {
  const v = raw.trim().toLowerCase();
  if (!v) return null;
  const bare = v.match(/^(\d+(?:\.\d+)?)$/);
  if (bare) return Math.round(Number(bare[1]) * (bareIsHours ? 60 : 1));
  const m = v.match(/^(?:(\d+(?:\.\d+)?)\s*(?:h|hr|hrs|hours?))?\s*(?:(\d+)\s*(?:m|min|mins|minutes?))?$/);
  if (!m || (!m[1] && !m[2])) return null;
  return Math.round(Number(m[1] ?? 0) * 60 + Number(m[2] ?? 0));
};
const DEFAULT_TARGET: Record<HabitKind, number> = { check: 1, quit: 1, count: 8, duration: 20, sleep: 480 };

export interface HabitImport { habits: HabitInput[]; skipped: string[] }

/** Reads a habit CSV. Rows already tracked (same name), a second sleep habit, and rows without a name are skipped. */
export function readHabitCsv(text: string, existing: Habit[]): HabitImport | { error: string } {
  const table = parseTable(text);
  if (table.length === 0) return { error: "That file has no rows." };
  const cols = table[0].map((h) => (Object.keys(HEADERS) as HCol[]).find((c) => HEADERS[c].test(h.trim())) ?? null);
  if (!cols.includes("name")) return { error: "The first row needs a Name column (Name, Type, Size, Category, Goal, Unit, Days, Time, Cue)." };
  const active = existing.filter((h) => !h.archived);
  const taken = new Set(active.map((h) => h.name.trim().toLowerCase()));
  let hasSleep = active.some((h) => h.kind === "sleep");
  const habits: HabitInput[] = [];
  const skipped: string[] = [];
  table.slice(1).forEach((cells, i) => {
    const get = (c: HCol) => { const j = cols.indexOf(c); return j < 0 ? "" : (cells[j] ?? "").trim(); };
    const name = get("name").slice(0, 80);
    const line = `Row ${i + 2}`;
    if (!/[\p{L}\p{N}]/u.test(name)) { skipped.push(`${line}: no name`); return; }
    if (taken.has(name.toLowerCase())) { skipped.push(`${name}: already tracked`); return; }
    const kind = parseKind(get("kind")) ?? (/^sleep$/i.test(name) ? "sleep" : "check");
    if (kind === "sleep" && hasSleep) { skipped.push(`${name}: you already track your sleep`); return; }
    let target = DEFAULT_TARGET[kind];
    const rawTarget = get("target");
    if (rawTarget) {
      if (kind === "count") {
        const n = Number(rawTarget.replace(/[,\s]/g, "").match(/^\d+/)?.[0]);
        if (!Number.isInteger(n) || n < 1 || n > 100000) { skipped.push(`${name}: the goal is a whole number from 1 to 100,000`); return; }
        target = n;
      } else if (kind === "duration") {
        const n = parseMinutes(rawTarget, false);
        if (n === null || n < 1 || n > 1440) { skipped.push(`${name}: the goal is 1 to 1440 minutes`); return; }
        target = n;
      } else if (kind === "sleep") {
        const n = parseMinutes(rawTarget, true);
        if (n === null || n < 60 || n > 960) { skipped.push(`${name}: the sleep goal is 1 to 16 hours`); return; }
        target = n;
      }
    }
    const time = kind === "sleep" ? null : parseTime(get("time"));
    habits.push({
      name,
      kind,
      scale: parseScale(get("scale")) ?? "daily",
      category: kind === "sleep" ? "sleep" : parseCategory(get("category")) ?? "other",
      target,
      unit: kind === "count" ? get("unit").slice(0, 20) : "",
      days: parseDays(get("days")) ?? ALL_DAYS,
      cue: get("cue").slice(0, 200),
      time,
    });
    taken.add(name.toLowerCase());
    if (kind === "sleep") hasSleep = true;
  });
  return { habits, skipped };
}
