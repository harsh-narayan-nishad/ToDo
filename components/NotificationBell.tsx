"use client";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AlertCircle, Bell, CalendarClock, CheckCheck, Flame, Moon, Sprout, Trophy, X } from "lucide-react";
import { addDays, clock, dayLabel, today } from "@/lib/days";
import { todoApi, type Task } from "@/lib/todo";
import { currentStreak, habitApi, indexEntries, isDone, isPlanned, isSkipped, type EntryIndex, type Habit } from "@/lib/habits";
import { cn } from "@/lib/utils";
import { TabIcon } from "@/components/TabIcons";

type Tone = "red" | "amber" | "blue" | "neutral";
interface Note { id: string; tone: Tone; icon: typeof Bell; message: string; detail: string; tab: "tasks" | "habits" }

const TONE: Record<Tone, string> = {
  red: "bg-accent-extreme/15 text-accent-extreme",
  amber: "bg-accent-fast/15 text-accent-fast",
  blue: "bg-accent-slow/15 text-accent-slow",
  neutral: "bg-overlay/10 text-ink-muted",
};
/** iOS-style icon tiles: a solid colour with a white icon. */
const TILE: Record<Tone, string> = { red: "#FF3B30", amber: "#FF9500", blue: "#007AFF", neutral: "#8E8E93" };
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
export function NotificationBell({ refreshKey, onNavigate, tab = false }: { refreshKey: number; onNavigate: (tab: "tasks" | "habits") => void; /** Phones: shown as an item of the bottom tab bar (the panel opens upwards). */ tab?: boolean }) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [habits, setHabits] = useState<Habit[]>([]);
  const [index, setIndex] = useState<EntryIndex>(new Map());
  const [seen, setSeen] = useState<{ read: string[]; gone: string[] }>({ read: [], gone: [] });
  const [open, setOpen] = useState(false);
  const [tick, setTick] = useState(0);
  const button = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const dim = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top?: number; bottom?: number; left: number; width: number } | null>(null);

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
    const width = Math.min(360, window.innerWidth - 24);
    const left = Math.max(12, Math.min(r.right - width, window.innerWidth - width - 12));
    // In the bottom tab bar: open above it.
    setPos(r.top > window.innerHeight / 2 ? { bottom: window.innerHeight - r.top + 8, width, left } : { top: r.bottom + 8, width, left });
  };
  useLayoutEffect(() => { if (open) place(); }, [open]);
  useEffect(() => {
    if (!open) return;
    void load();
    const onDown = (e: PointerEvent) => {
      if (e.target === dim.current) return; // the dim layer closes on its own click, so the tap reaches nothing underneath
      if (!panel.current?.contains(e.target as Node) && !button.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", place);
    return () => { document.removeEventListener("pointerdown", onDown); document.removeEventListener("keydown", onKey); window.removeEventListener("resize", place); };
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      {tab ? (
        <button ref={button} type="button" data-tour="alerts" onClick={() => setOpen((o) => !o)} aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"} aria-expanded={open} aria-haspopup="dialog"
          className="flex flex-1 flex-col items-center gap-[3px] pb-1 pt-1.5 text-[10px] font-medium tracking-[0.01em]" style={{ color: open ? "#007AFF" : "#8E8E93" }}>
          <span className="relative">
            <TabIcon name="alerts" active={open} />
            {unread > 0 && <span className="absolute -right-2.5 -top-1 flex h-[17px] min-w-[17px] items-center justify-center rounded-full bg-[#FF3B30] px-1 text-[10px] font-semibold leading-none text-white">{unread > 9 ? "9+" : unread}</span>}
          </span>
          Alerts
        </button>
      ) : (
      <button ref={button} type="button" data-tour="alerts" onClick={() => setOpen((o) => !o)} aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"} aria-expanded={open} aria-haspopup="dialog"
        className="ios-circle-btn relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[#007AFF] transition-transform active:scale-95">
        <Bell className="h-[18px] w-[18px]" strokeWidth={1.9} />
        {unread > 0 && (
          <span className="absolute -right-1 -top-1 flex h-[19px] min-w-[19px] items-center justify-center rounded-full bg-[#FF3B30] px-1 text-[11px] font-semibold leading-none text-white ring-2 ring-canvas">{unread > 9 ? "9+" : unread}</span>
        )}
      </button>
      )}
      {open && pos && createPortal(
        <>
        {/* The page behind dims (no blur) so it does not distract; a tap there only closes the panel. */}
        <div ref={dim} className="notif-dim fade-in fixed inset-0 z-[115]" aria-hidden onClick={() => setOpen(false)} />
        // Like iOS Notification Centre: a blurred backdrop, a bold title, and each notification on its own frosted card.
        <div ref={panel} data-tour="alerts-panel" role="dialog" aria-label="Notifications" className="ios-notif-backdrop glass-in fixed z-[120] overflow-hidden rounded-[26px] p-2.5 shadow-themed"
          style={{ top: pos.top, bottom: pos.bottom, left: pos.left, width: pos.width }}>
          <div className="flex items-center justify-between gap-2 px-2 pb-2.5 pt-1">
            <span className="text-[20px] font-semibold tracking-[-0.01em] text-ink">Notifications</span>
            {unread > 0 && (
              <button type="button" onClick={markAll} className="ios-notif flex items-center gap-1 rounded-full px-3 py-1 text-[13px] font-medium text-ink-muted active:scale-95">
                <CheckCheck className="h-3.5 w-3.5" /> Mark all read
              </button>
            )}
          </div>
          <div className="flex max-h-[min(26rem,70vh)] flex-col gap-2 overflow-y-auto">
            {notes.length === 0 ? <p className="ios-notif rounded-[18px] px-4 py-6 text-center text-[15px] text-ink-muted">You're all caught up.</p> : notes.map((n) => {
              const Icon = n.icon;
              const read = seen.read.includes(n.id);
              return (
                <div key={n.id} className={cn("ios-notif relative flex items-start gap-3 rounded-[18px] p-3 pr-10 transition-opacity", read && "opacity-70")}>
                  <button type="button" onClick={() => { update({ ...seen, read: [...new Set([...seen.read, n.id])] }); setOpen(false); onNavigate(n.tab); }} className="flex min-w-0 flex-1 items-start gap-3 text-left">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[9px] text-white" style={{ backgroundColor: TILE[n.tone] }}><Icon className="h-[18px] w-[18px]" strokeWidth={2} /></span>
                    <span className="min-w-0 flex-1">
                      <span className={cn("block break-words text-[15px] leading-snug text-ink", read ? "font-normal" : "font-semibold")}>{n.message}</span>
                      <span className="mt-0.5 block line-clamp-2 text-[14px] leading-snug text-ink-muted">{n.detail}</span>
                    </span>
                    {!read && <span className="sr-only">Unread</span>}
                  </button>
                  <button type="button" onClick={() => clear(n.id)} aria-label="Clear notification"
                    className="absolute right-2.5 top-2.5 grid h-6 w-6 place-items-center rounded-full bg-overlay/10 text-ink-muted active:scale-95"><X className="h-3 w-3" strokeWidth={2.5} /></button>
                </div>
              );
            })}
          </div>
        </div>
        </>,
        document.body,
      )}
    </>
  );
}
