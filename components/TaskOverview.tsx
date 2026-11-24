"use client";
import { useMemo, useState } from "react";
import { ChevronDown, Search } from "lucide-react";
import { Section, Segmented, SettingsSheet } from "@/components/HabitDialogs";
import { Pager } from "@/components/ui";
import { addDays, dayLabel, duration, today } from "@/lib/days";
import { weekday } from "@/lib/repeat";
import type { Task } from "@/lib/todo";
import { cn } from "@/lib/utils";

const PAGE = 10;
type Sort = "occurrences" | "time" | "rate" | "name";
const SORTS: { id: Sort; label: string }[] = [{ id: "occurrences", label: "Most often" }, { id: "time", label: "Most time" }, { id: "rate", label: "Best done" }, { id: "name", label: "A–Z" }];

/** Tasks with the same title (a routine planned on many days) counted together. */
interface Group { key: string; title: string; items: Task[]; done: number; missed: number; open: number; upcoming: number; minutes: number; first: string; last: string; next: string | null }

const status = (t: Task, now: string) => (t.status === "done" ? "done" : t.dueDay < now ? "missed" : t.startDay > now ? "upcoming" : "open");
/** Each occurrence as a rounded chip: done (green), missed (red), open (blue), upcoming (dashed). */
const TONE = { done: "bg-[#34C759] text-white", missed: "border border-[#FF3B30]/50 text-[#FF3B30]", open: "border border-[#3478F6]/50 text-[#3478F6]", upcoming: "border border-dashed border-overlay/25 text-ink-muted" };

/**
 * Overview of all tasks: totals (done, missed, open, upcoming, time worked), then every task with how often it
 * occurs, how many of those were done or missed, and how much time it got. Opening a task lists every occurrence.
 */
export function TaskOverview({ tasks, onClose }: { tasks: Task[]; onClose: () => void }) {
  const now = today();
  const weekEnd = addDays(now, 6 - weekday(now));
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<Sort>("occurrences");
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<string | null>(null);

  const totals = useMemo(() => {
    const c = { all: tasks.length, done: 0, missed: 0, open: 0, upcoming: 0, week: 0, minutes: 0 };
    for (const t of tasks) {
      c[status(t, now)]++;
      c.minutes += t.loggedMinutes ?? 0;
      if (t.status === "open" && t.startDay > now && t.startDay <= weekEnd) c.week++;
    }
    return c;
  }, [tasks, now, weekEnd]);
  const finished = totals.done + totals.missed;

  const groups = useMemo(() => {
    const m = new Map<string, Group>();
    for (const t of tasks) {
      const key = t.title.trim().toLowerCase();
      const g = m.get(key) ?? { key, title: t.title.trim(), items: [], done: 0, missed: 0, open: 0, upcoming: 0, minutes: 0, first: t.startDay, last: t.dueDay, next: null };
      g.items.push(t);
      g[status(t, now)]++;
      g.minutes += t.loggedMinutes ?? 0;
      if (t.startDay < g.first) g.first = t.startDay;
      if (t.dueDay > g.last) g.last = t.dueDay;
      if (t.status === "open" && t.dueDay >= now && (!g.next || t.startDay < g.next)) g.next = t.startDay;
      m.set(key, g);
    }
    for (const g of m.values()) g.items.sort((a, b) => a.startDay.localeCompare(b.startDay));
    return [...m.values()];
  }, [tasks, now]);

  const rate = (g: Group) => (g.done + g.missed ? g.done / (g.done + g.missed) : -1);
  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    const l = groups.filter((g) => !q || g.key.includes(q));
    const by: Record<Sort, (a: Group, b: Group) => number> = {
      occurrences: (a, b) => b.items.length - a.items.length,
      time: (a, b) => b.minutes - a.minutes,
      rate: (a, b) => rate(b) - rate(a),
      name: () => 0,
    };
    return l.sort((a, b) => by[sort](a, b) || a.title.localeCompare(b.title));
  }, [groups, query, sort]);
  const pages = Math.max(1, Math.ceil(list.length / PAGE));
  const p = Math.min(page, pages);

  const stat = (label: string, value: string | number, hint?: string, tone = "text-ink") => (
    <div className="px-4 py-3">
      <p className="text-[12px] uppercase tracking-wide text-ink-faint">{label}</p>
      <p className={cn("mt-0.5 font-display text-[26px] leading-tight tabular-nums", tone)}>{value}</p>
      {hint && <p className="mt-0.5 text-[12px] text-ink-muted">{hint}</p>}
    </div>
  );

  return (
    <SettingsSheet label="Overview" onClose={onClose} wide>
      {/* The totals: one rounded group of facts, two per row (four on wide screens). */}
      <Section title="Totals">
        <div className="pw-group grid grid-cols-2 overflow-hidden rounded-[14px] sm:grid-cols-4 [&>div]:border-overlay/10 max-sm:[&>div:nth-child(even)]:border-l max-sm:[&>div:nth-child(n+3)]:border-t sm:[&>div:not(:nth-child(4n+1))]:border-l sm:[&>div:nth-child(n+5)]:border-t">
          {stat("All tasks", totals.all, `${groups.length} different`)}
          {stat("Done", totals.done, finished ? `${Math.round((totals.done / finished) * 100)}% of past tasks` : undefined, "text-[#34C759]")}
          {stat("Missed", totals.missed, "Past due, not done", totals.missed ? "text-[#FF3B30]" : "text-ink")}
          {stat("Time worked", duration(totals.minutes), undefined, "text-[#3478F6]")}
          {stat("Open now", totals.open)}
          {stat("Upcoming", totals.upcoming, `${totals.week} this week`)}
          {stat("Done per task", groups.length ? (totals.done / groups.length).toFixed(1) : "–", "On average")}
          {stat("Time per done task", totals.done ? duration(Math.round(totals.minutes / totals.done)) : "–")}
        </div>
        {finished > 0 && (
          <div className="mt-3 px-1">
            <div className="flex h-2 w-full overflow-hidden rounded-full bg-overlay/10" aria-hidden>
              <span className="bg-[#34C759]" style={{ width: `${(totals.done / totals.all) * 100}%` }} />
              <span className="bg-[#FF3B30]/70" style={{ width: `${(totals.missed / totals.all) * 100}%` }} />
              <span className="bg-[#3478F6]/70" style={{ width: `${(totals.open / totals.all) * 100}%` }} />
            </div>
            <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-ink-muted">
              <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-[#34C759]" />Done {totals.done}</span>
              <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-[#FF3B30]/70" />Missed {totals.missed}</span>
              <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-[#3478F6]/70" />Open {totals.open}</span>
              <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-overlay/20" />Upcoming {totals.upcoming}</span>
            </p>
          </div>
        )}
      </Section>

      <Section title="By task">
        <div className="flex flex-col gap-3">
        <Segmented soft label="Sort tasks" value={sort} options={SORTS} onChange={(s) => { setSort(s); setPage(1); }} />
        <label className="pw-group flex min-h-[44px] items-center gap-2.5 rounded-[14px] px-4">
          <Search className="h-4 w-4 shrink-0 text-ink-faint" aria-hidden />
          <input value={query} onChange={(e) => { setQuery(e.target.value); setPage(1); }} placeholder="Find a task" aria-label="Find a task"
            className="w-full min-w-0 bg-transparent py-2.5 text-[16px] text-ink outline-none placeholder:text-ink-faint" />
        </label>
        {list.length === 0 ? <p className="px-4 text-[15px] text-ink-faint">{tasks.length ? "No task matches." : "No tasks yet."}</p> : (
          <ul className="pw-group flex flex-col divide-y divide-overlay/10 overflow-hidden rounded-[14px]">
            {list.slice((p - 1) * PAGE, p * PAGE).map((g) => {
              const r = rate(g);
              const isOpen = open === g.key;
              return (
                <li key={g.key}>
                  <button type="button" onClick={() => setOpen(isOpen ? null : g.key)} aria-expanded={isOpen} className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors active:bg-overlay/[0.06]">
                    <span className="min-w-0 flex-1">
                      <span className="block break-words text-[16px] text-ink">{g.title}</span>
                      <span className="mt-0.5 block text-[13px] leading-snug text-ink-muted">
                        {g.items.length} {g.items.length === 1 ? "time" : "times"} · {g.done} done{g.missed ? ` · ${g.missed} missed` : ""}{g.open ? ` · ${g.open} open` : ""}{g.upcoming ? ` · ${g.upcoming} upcoming` : ""}
                        {` · ${g.first === g.last ? dayLabel(g.first, now) : `${dayLabel(g.first, now)} → ${dayLabel(g.last, now)}`}`}
                        {g.next && ` · next ${dayLabel(g.next, now).toLowerCase()}`}
                      </span>
                      {r >= 0 && <span className="mt-2 block h-1.5 w-full max-w-xs overflow-hidden rounded-full bg-overlay/10"><span className="block h-full rounded-full bg-[#34C759]" style={{ width: `${r * 100}%` }} /></span>}
                    </span>
                    <span className="shrink-0 text-right">
                      <span className="block text-[15px] font-medium tabular-nums text-ink">{duration(g.minutes)}</span>
                      <span className={cn("block text-[12px]", r >= 0 ? "text-[#34C759]" : "text-ink-faint")}>{r >= 0 ? `${Math.round(r * 100)}% done` : "not due yet"}</span>
                    </span>
                    <ChevronDown className={cn("mt-1 h-4 w-4 shrink-0 text-ink-faint transition-transform", isOpen && "rotate-180")} aria-hidden />
                  </button>
                  {isOpen && (
                    <div className="flex flex-wrap gap-1.5 px-4 pb-4">
                      {g.items.map((t) => {
                        const s = status(t, now);
                        return (
                          <span key={t.id} title={`${s}${t.loggedMinutes ? ` · ${duration(t.loggedMinutes)}` : ""}`} className={cn("rounded-full px-2.5 py-0.5 text-[12px]", TONE[s])}>
                            {t.startDay === t.dueDay ? dayLabel(t.startDay, now) : `${dayLabel(t.startDay, now)} → ${dayLabel(t.dueDay, now)}`}
                            {t.loggedMinutes ? ` · ${duration(t.loggedMinutes)}` : ""}
                          </span>
                        );
                      })}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        {list.length > 0 && <div className="px-1"><Pager page={p} total={list.length} limit={PAGE} onPage={setPage} /></div>}
        </div>
      </Section>
    </SettingsSheet>
  );
}
