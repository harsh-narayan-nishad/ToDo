"use client";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AlertCircle, Bell, CalendarClock, CheckCheck, Flame, Moon, Sprout, Trophy, X } from "lucide-react";
import { addDays, clock, dayLabel, today } from "@/lib/days";
import { todoApi, type Task } from "@/lib/todo";
import { currentStreak, habitApi, indexEntries, isDone, isPlanned, isSkipped, type EntryIndex, type Habit } from "@/lib/habits";
import { cn } from "@/lib/utils";

type Tone = "red" | "amber" | "blue" | "neutral";
interface Note { id: string; tone: Tone; icon: typeof Bell; message: string; detail: string; tab: "tasks" | "habits" }

const TONE: Record<Tone, string> = {
  red: "bg-accent-extreme/15 text-accent-extreme",
  amber: "bg-accent-fast/15 text-accent-fast",
  blue: "bg-accent-slow/15 text-accent-slow",
  neutral: "bg-overlay/10 text-ink-muted",
};
const KEY = "pacewise-todo-notifications";
/** Read and cleared notifications, remembered on this device only. */
function loadSeen(): { read: string[]; gone: string[] } {
  try { return { read: [], gone: [], ...JSON.parse(localStorage.getItem(KEY) ?? "{}") }; } catch { return { read: [], gone: [] }; }
}
function saveSeen(s: { read: string[]; gone: string[] }) {
  // Keep the lists short: only the last 300 of each.
  try { localStorage.setItem(KEY, JSON.stringify({ read: s.read.slice(-300), gone: s.gone.slice(-300) })); } catch { /* storage blocked */ }
}
/** "yesterday", "today", or "Wed 18 Nov" (only the relative words in lower case). */
const when = (day: string, now: string) => { const l = dayLabel(day, now); return /^(Today|Yesterday|Tomorrow)$/.test(l) ? l.toLowerCase() : l; };
const names = (hs: Habit[]) => (hs.length <= 3 ? hs.map((h) => h.name).join(", ") : `${hs.slice(0, 3).map((h) => h.name).join(", ")} and ${hs.length - 3} more`);

/** What deserves a notification right now, from the tasks and habits (nothing is sent to the server). */
function build(tasks: Task[], habits: Habit[], index: EntryIndex, now: string, minutes: number): Note[] {
  const out: Note[] = [];
  const open = tasks.filter((t) => t.status === "open");

  // Missed tasks: past their due day and not done (past days are locked).
  for (const t of open.filter((t) => t.dueDay < now).sort((a, b) => b.dueDay.localeCompare(a.dueDay))) {
    out.push({ id: `missed-${t.id}`, tone: "red", icon: AlertCircle, message: `Missed: ${t.title}`, detail: `Was due ${when(t.dueDay, now)} · not done`, tab: "tasks" });
  }
  // Today's tasks: starting within the hour first, then the rest still to do.
  for (const t of open.filter((t) => t.startDay <= now && t.dueDay >= now)) {
    const at = t.startTime && t.startDay === now ? Number(t.startTime.slice(0, 2)) * 60 + Number(t.startTime.slice(3, 5)) : null;
    const soon = at !== null && at >= minutes && at - minutes <= 60;
    const planned = t.startTime && t.endTime ? `${clock(t.startTime)} – ${clock(t.endTime)}` : t.dueDay === now ? "today" : `until ${when(t.dueDay, now)}`;
    out.push({ id: `today-${now}-${t.id}${soon ? "-soon" : ""}`, tone: soon ? "amber" : "blue", icon: CalendarClock, message: soon ? `Starts soon: ${t.title}` : `Due ${t.dueDay === now ? "today" : "soon"}: ${t.title}`, detail: soon ? `At ${clock(t.startTime!)}` : `Planned ${planned}`, tab: "tasks" });
  }

  const active = habits.filter((h) => !h.archived);
  const todays = active.filter((h) => isPlanned(h, now) && !isSkipped(index.get(h.id)?.get(now)));
  const left = todays.filter((h) => !isDone(h, index.get(h.id)?.get(now)));
  const sleep = left.find((h) => h.kind === "sleep");
  const others = left.filter((h) => h.kind !== "sleep");

  // Streaks at risk: a habit with a streak of 2+ days that is not done yet today.
  for (const h of others) {
    const s = currentStreak(h, index.get(h.id), now);
    if (s >= 2) out.push({ id: `streak-${now}-${h.id}`, tone: "amber", icon: Flame, message: `Keep your ${s}-day streak: ${h.name}`, detail: "Not done yet today", tab: "habits" });
  }
  if (others.length) out.push({ id: `habits-${now}-${others.length}`, tone: "neutral", icon: Sprout, message: `${others.length} habit${others.length === 1 ? "" : "s"} left today`, detail: names(others), tab: "habits" });
  else if (todays.length) out.push({ id: `habits-done-${now}`, tone: "blue", icon: Trophy, message: `All ${todays.length} habit${todays.length === 1 ? "" : "s"} done today`, detail: "Nice work. Your streaks are safe.", tab: "habits" });
  if (sleep) out.push({ id: `sleep-${now}`, tone: "neutral", icon: Moon, message: "Log last night's sleep", detail: "Bed and wake time", tab: "habits" });

  // Habits missed yesterday (planned, not done, not skipped).
  const y = addDays(now, -1);
  const missedY = active.filter((h) => isPlanned(h, y) && !isSkipped(index.get(h.id)?.get(y)) && !isDone(h, index.get(h.id)?.get(y)));
  if (missedY.length) out.push({ id: `habits-missed-${y}`, tone: "red", icon: AlertCircle, message: `Missed yesterday: ${missedY.length} habit${missedY.length === 1 ? "" : "s"}`, detail: names(missedY), tab: "habits" });
  return out;
}

/**
 * The notification bell, like Pacewise's: a round button with a red count of unread notifications. It lists missed
 * tasks, today's tasks (and ones starting within the hour), habits left today, streaks at risk, sleep to log, and
 * habits missed yesterday. Click one to open its section. Mark all read / clear one; remembered on this device.
 */
export function NotificationBell({ refreshKey, onNavigate }: { refreshKey: number; onNavigate: (tab: "tasks" | "habits") => void }) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [habits, setHabits] = useState<Habit[]>([]);
  const [index, setIndex] = useState<EntryIndex>(new Map());
  const [seen, setSeen] = useState<{ read: string[]; gone: string[] }>({ read: [], gone: [] });
  const [open, setOpen] = useState(false);
  const [tick, setTick] = useState(0);
  const button = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);

  useEffect(() => setSeen(loadSeen()), []);
  const load = useCallback(async () => {
    const now = today();
    const [t, h, e] = await Promise.allSettled([todoApi.tasks(), habitApi.list(), habitApi.entries(addDays(now, -60), now)]);
    if (t.status === "fulfilled") setTasks(t.value);
    if (h.status === "fulfilled") setHabits(h.value);
    if (e.status === "fulfilled") setIndex(indexEntries(e.value));
  }, []);
  useEffect(() => { void load(); }, [load, refreshKey]);
  // Every 5 minutes: "starts soon" and the day change stay current.
  useEffect(() => { const id = setInterval(() => { setTick((n) => n + 1); void load(); }, 5 * 60_000); return () => clearInterval(id); }, [load]);

  const notes = useMemo(() => {
    const d = new Date();
    return build(tasks, habits, index, today(), d.getHours() * 60 + d.getMinutes()).filter((n) => !seen.gone.includes(n.id));
  }, [tasks, habits, index, seen.gone, tick]); // eslint-disable-line react-hooks/exhaustive-deps
  const unread = notes.filter((n) => !seen.read.includes(n.id)).length;

  const update = (next: { read: string[]; gone: string[] }) => { setSeen(next); saveSeen(next); };
  const markAll = () => update({ ...seen, read: [...new Set([...seen.read, ...notes.map((n) => n.id)])] });
  const clear = (id: string) => update({ read: seen.read, gone: [...seen.gone, id] });

  const place = () => {
    const r = button.current?.getBoundingClientRect();
    if (!r) return;
    const width = Math.min(340, window.innerWidth - 24);
    setPos({ top: r.bottom + 8, width, left: Math.max(12, Math.min(r.right - width, window.innerWidth - width - 12)) });
  };
  useLayoutEffect(() => { if (open) place(); }, [open]);
  useEffect(() => {
    if (!open) return;
    void load();
    const onDown = (e: PointerEvent) => { if (!panel.current?.contains(e.target as Node) && !button.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", place);
    return () => { document.removeEventListener("pointerdown", onDown); document.removeEventListener("keydown", onKey); window.removeEventListener("resize", place); };
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      <button ref={button} type="button" onClick={() => setOpen((o) => !o)} aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"} aria-expanded={open} aria-haspopup="dialog"
        className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-overlay/[0.08] text-ink-muted transition-colors active:scale-95">
        <Bell className="h-4 w-4" />
        {unread > 0 && (
          <span className="absolute right-1 top-1 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-accent-extreme px-1 text-[10px] font-semibold leading-none text-white">{unread > 9 ? "9+" : unread}</span>
        )}
      </button>
      {open && pos && createPortal(
        <div ref={panel} role="dialog" aria-label="Notifications" className="glass-in fixed z-[120] overflow-hidden rounded-xl border border-overlay/10 bg-canvas-raised shadow-themed"
          style={{ top: pos.top, left: pos.left, width: pos.width }}>
          <div className="flex items-center justify-between border-b border-overlay/10 px-3.5 py-2.5">
            <span className="text-xs font-medium uppercase tracking-wide text-ink-muted">Notifications</span>
            {unread > 0 && <button type="button" onClick={markAll} className="flex items-center gap-1 text-xs text-ink-muted"><CheckCheck className="h-3.5 w-3.5" /> Mark all read</button>}
          </div>
          <div className="max-h-[min(24rem,70vh)] overflow-y-auto">
            {notes.length === 0 ? <p className="px-3.5 py-6 text-center text-sm text-ink-muted">You're all caught up.</p> : notes.map((n) => {
              const Icon = n.icon;
              const read = seen.read.includes(n.id);
              return (
                <div key={n.id} className="flex items-start gap-2 border-b border-overlay/5 px-3.5 py-2.5 last:border-b-0">
                  <button type="button" onClick={() => { update({ ...seen, read: [...new Set([...seen.read, n.id])] }); setOpen(false); onNavigate(n.tab); }} className="flex min-w-0 flex-1 items-start gap-2.5 text-left">
                    <span className={cn("mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full", TONE[n.tone])}><Icon className="h-3.5 w-3.5" /></span>
                    <span className="min-w-0 flex-1">
                      <span className={cn("block break-words text-sm", read ? "text-ink-muted" : "text-ink")}>{n.message}</span>
                      <span className="block truncate text-xs text-ink-faint">{n.detail}</span>
                    </span>
                    {!read && <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-accent-extreme" aria-label="Unread" />}
                  </button>
                  <button type="button" onClick={() => clear(n.id)} aria-label="Clear notification" className="shrink-0 rounded-full p-1 text-ink-faint"><X className="h-3.5 w-3.5" /></button>
                </div>
              );
            })}
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
