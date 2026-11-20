"use client";
import { useMemo, useState } from "react";
import { ChevronDown, Search } from "lucide-react";
import { GlassSheet } from "@/components/HabitDialogs";
import { FIELD, Pager } from "@/components/ui";
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
const TONE = { done: "bg-ink text-canvas", missed: "border border-accent-extreme/50 text-accent-extreme", open: "border border-ink/40 text-ink", upcoming: "border border-dashed border-overlay/25 text-ink-muted" };

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

  const stat = (label: string, value: string | number, hint?: string) => (
    <div className="border border-overlay/10 bg-canvas-raised/60 px-4 py-3">
      <p className="text-xs text-ink-muted">{label}</p>
      <p className="mt-1 font-display text-2xl text-ink">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-ink-faint">{hint}</p>}
    </div>
  );

  return (
    <GlassSheet label="Overview" onClose={onClose} wide>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {stat("All tasks", totals.all, `${groups.length} different`)}
        {stat("Done", totals.done, finished ? `${Math.round((totals.done / finished) * 100)}% of past tasks` : undefined)}
        {stat("Missed", totals.missed, "Past due, not done")}
        {stat("Time worked", duration(totals.minutes))}
        {stat("Open now", totals.open)}
        {stat("Upcoming", totals.upcoming, `${totals.week} this week`)}
        {stat("Done per task", groups.length ? (totals.done / groups.length).toFixed(1) : "–", "On average")}
        {stat("Time per done task", totals.done ? duration(Math.round(totals.minutes / totals.done)) : "–")}
      </div>

      {finished > 0 && (
        <div>
          <div className="flex h-2 w-full overflow-hidden bg-overlay/10" aria-hidden>
            <span className="bg-ink" style={{ width: `${(totals.done / totals.all) * 100}%` }} />
            <span className="bg-accent-extreme/60" style={{ width: `${(totals.missed / totals.all) * 100}%` }} />
            <span className="bg-ink/35" style={{ width: `${(totals.open / totals.all) * 100}%` }} />
          </div>
          <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-faint">
            <span><span className="mr-1.5 inline-block h-2 w-2 bg-ink" />Done {totals.done}</span>
            <span><span className="mr-1.5 inline-block h-2 w-2 bg-accent-extreme/60" />Missed {totals.missed}</span>
            <span><span className="mr-1.5 inline-block h-2 w-2 bg-ink/35" />Open {totals.open}</span>
            <span><span className="mr-1.5 inline-block h-2 w-2 bg-overlay/10" />Upcoming {totals.upcoming}</span>
          </p>
        </div>
      )}

      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h3 className="text-sm uppercase tracking-wide text-ink-muted">By task</h3>
          <div className="flex flex-wrap gap-1">
            {SORTS.map((s) => (
              <button key={s.id} type="button" onClick={() => { setSort(s.id); setPage(1); }} aria-pressed={sort === s.id}
                className={cn("rounded-none border px-3 py-1 text-xs transition-colors", sort === s.id ? "border-ink bg-ink text-canvas" : "border-overlay/15 text-ink-muted")}>{s.label}</button>
            ))}
          </div>
        </div>
        <label className="relative block">
          <Search className="pointer-events-none absolute left-0 top-2.5 h-4 w-4 text-ink-faint" aria-hidden />
          <input value={query} onChange={(e) => { setQuery(e.target.value); setPage(1); }} placeholder="Find a task" aria-label="Find a task" className={cn(FIELD, "mt-0 pl-6")} />
        </label>
        {list.length === 0 ? <p className="text-sm text-ink-faint">{tasks.length ? "No task matches." : "No tasks yet."}</p> : (
          <ul className="flex flex-col divide-y divide-overlay/10 border border-overlay/10">
            {list.slice((p - 1) * PAGE, p * PAGE).map((g) => {
              const r = rate(g);
              const isOpen = open === g.key;
              return (
                <li key={g.key}>
                  <button type="button" onClick={() => setOpen(isOpen ? null : g.key)} aria-expanded={isOpen} className="flex w-full items-start gap-3 px-4 py-3 text-left">
                    <span className="min-w-0 flex-1">
                      <span className="block break-words text-ink">{g.title}</span>
                      <span className="mt-1 block text-xs text-ink-faint">
                        {g.items.length} {g.items.length === 1 ? "time" : "times"} · {g.done} done{g.missed ? ` · ${g.missed} missed` : ""}{g.open ? ` · ${g.open} open` : ""}{g.upcoming ? ` · ${g.upcoming} upcoming` : ""}
                        {` · ${g.first === g.last ? dayLabel(g.first, now) : `${dayLabel(g.first, now)} → ${dayLabel(g.last, now)}`}`}
                        {g.next && ` · next ${dayLabel(g.next, now).toLowerCase()}`}
                      </span>
                      {r >= 0 && <span className="mt-2 block h-1 w-full max-w-xs bg-overlay/10"><span className="block h-full bg-ink" style={{ width: `${r * 100}%` }} /></span>}
                    </span>
                    <span className="shrink-0 text-right">
                      <span className="block font-mono text-sm text-ink">{duration(g.minutes)}</span>
                      <span className="block text-xs text-ink-faint">{r >= 0 ? `${Math.round(r * 100)}% done` : "not due yet"}</span>
                    </span>
                    <ChevronDown className={cn("mt-1 h-4 w-4 shrink-0 text-ink-muted transition-transform", isOpen && "rotate-180")} aria-hidden />
                  </button>
                  {isOpen && (
                    <div className="flex flex-wrap gap-1.5 px-4 pb-4">
                      {g.items.map((t) => {
                        const s = status(t, now);
                        return (
                          <span key={t.id} title={`${s}${t.loggedMinutes ? ` · ${duration(t.loggedMinutes)}` : ""}`} className={cn("px-2 py-0.5 text-xs", TONE[s])}>
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
        {list.length > 0 && <Pager page={p} total={list.length} limit={PAGE} onPage={setPage} />}
      </section>
    </GlassSheet>
  );
}
