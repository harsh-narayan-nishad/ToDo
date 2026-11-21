"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, CalendarDays, ListChecks, Sprout, LogOut, Moon, Sun, UserRound } from "lucide-react";
import { Logo } from "@/components/Logo";
import { HamburgerMenu } from "@/components/HamburgerMenu";
import { TabIcon, type TabIconName } from "@/components/TabIcons";
import { NotificationBell } from "@/components/NotificationBell";
import { WheelSpinner } from "@/components/WheelSpinner";
import { LoginCard } from "@/components/LoginCard";
import { TasksPanel } from "@/components/TasksPanel";
import { PLANNER_DRAFT_KEY } from "@/components/TaskPlanner";
import { HistoryPanel } from "@/components/HistoryPanel";
import { HabitsPanel } from "@/components/HabitsPanel";
import { ProfilePanel } from "@/components/ProfilePanel";
import { CalendarPanel } from "@/components/Calendar/CalendarPanel";
import { api, ApiError, logout, session, type User } from "@/lib/api";
import { today } from "@/lib/days";
import { cn } from "@/lib/utils";
import { isNeetAspirant } from "@/lib/neetSyllabus";

type Tab = "tasks" | "history" | "habits" | "profile" | "calendar";
const TABS: { id: Tab; label: string; icon: typeof ListChecks }[] = [
  { id: "tasks", label: "Tasks", icon: ListChecks },
  // History is in the hamburger menu, not here.
  // Habit tracker: micro to macro habits, habits to quit, and sleep.
  { id: "habits", label: "Habits", icon: Sprout },
  { id: "profile", label: "Profile", icon: UserRound },
  // The Pacewise calendar, copied into To-do: it opens here instead of sending you to Pacewise.
  { id: "calendar", label: "Calendar", icon: CalendarDays },
];
const THEME_KEY = "pacewise-todo-theme";
/** The theme the person picked (saved only when they pick one). Without a choice: light on phones, dark on wider screens. */
const THEME_CHOICE_KEY = "pacewise-todo-theme-choice";
const isPhone = () => window.matchMedia("(max-width: 767px)").matches;

export function TodoApp() {
  const [user, setUser] = useState<User | null>(null);
  const [checking, setChecking] = useState(true);
  const [tab, setTab] = useState<Tab>("tasks");
  const [historyDay, setHistoryDay] = useState(today());
  /** Starts as the picked theme (or light on phones), so the page never switches to dark for a moment on load. */
  const [light, setLight] = useState(() => {
    if (typeof window === "undefined") return false;
    try { const chosen = localStorage.getItem(THEME_CHOICE_KEY); if (chosen) return chosen === "light"; } catch { /* storage blocked */ }
    return isPhone();
  });
  /** Bumped after every change so the profile and history reload. */
  const [version, setVersion] = useState(0);

  useEffect(() => {
    (async () => {
      if (session.get()) {
        try {
          setUser((await api<{ user: User }>("/auth/me")).user);
        } catch (e) {
          if (e instanceof ApiError && e.status !== 0) session.clear();
        }
      }
      try {
        const chosen = localStorage.getItem(THEME_CHOICE_KEY);
        setLight(chosen ? chosen === "light" : isPhone());
      } catch { setLight(isPhone()); /* storage blocked */ }
      setChecking(false);
    })();
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", light ? "light" : "dark");
    try { localStorage.setItem(THEME_KEY, light ? "light" : "dark"); } catch { /* storage blocked */ }
  }, [light]);

  const pickTheme = useCallback((v: boolean) => {
    setLight(v);
    try { localStorage.setItem(THEME_CHOICE_KEY, v ? "light" : "dark"); } catch { /* storage blocked */ }
  }, []);

  const signOut = useCallback(async () => {
    try { localStorage.removeItem(PLANNER_DRAFT_KEY); } catch { /* storage blocked */ }
    await logout(); setUser(null); setTab("tasks");
  }, []);
  const changed = useCallback(() => setVersion((v) => v + 1), []);
  /** Bumped when this tab becomes visible again, so edits made in the Pacewise calendar show up here. */
  const [refreshKey, setRefreshKey] = useState(0);
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      setRefreshKey((k) => k + 1);
      setVersion((v) => v + 1);
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => { document.removeEventListener("visibilitychange", onVisible); window.removeEventListener("focus", onVisible); };
  }, []);
  const openDay = useCallback((day: string) => { setHistoryDay(day); setTab("history"); }, []);
  /**
   * Back between sections: every section opened gets its own browser history entry, so the phone's Back button
   * (or swipe) and the ← button both go to the section before, and only leave the app from Tasks.
   */
  const fromBack = useRef(false);
  useEffect(() => {
    const st = window.history.state as { todoTab?: Tab } | null;
    if (!st?.todoTab) window.history.replaceState({ ...(st ?? {}), todoTab: "tasks" }, "");
    const onPop = (e: PopStateEvent) => {
      fromBack.current = true;
      setTab((e.state as { todoTab?: Tab } | null)?.todoTab ?? "tasks");
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
  useEffect(() => {
    if (fromBack.current) { fromBack.current = false; return; }
    if ((window.history.state as { todoTab?: Tab } | null)?.todoTab !== tab) window.history.pushState({ todoTab: tab }, "");
  }, [tab]);
  const goBack = useCallback(() => {
    if ((window.history.state as { todoTab?: Tab } | null)?.todoTab && window.history.length > 1) window.history.back();
    else setTab("tasks");
  }, []);
  /** Phones get a bottom tab bar (sections, notifications, More); wider screens keep the bell and menu at the top. */
  const [phone, setPhone] = useState(() => typeof window !== "undefined" && window.matchMedia("(max-width: 767px)").matches);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const on = () => setPhone(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  /** Open tasks due now (today + overdue), for the phone greeting; null until the task list has loaded. */
  const [dueNow, setDueNow] = useState<number | null>(null);

  if (checking) return <div className="relative min-h-screen"><WheelSpinner label="Signing you in" /></div>;
  if (!user) return <LoginCard onSignedIn={setUser} />;

  return (
    <div className="flex min-h-screen w-full flex-col gap-6 px-4 py-6 max-md:pb-28 sm:px-6 md:flex-row md:gap-10 md:px-10 md:py-10">
      {/* Phones: an iOS tab bar at the bottom — the sections, notifications, and More (Profile, History, theme, log out). */}
      {phone && (
        <nav aria-label="Sections" className="ios-tabbar fixed inset-x-0 bottom-0 z-50 flex px-1 pb-[max(0.25rem,env(safe-area-inset-bottom))]">
          {TABS.filter((t) => t.id !== "profile").map(({ id, label }) => (
            <button key={id} type="button" onClick={() => setTab(id)} aria-current={tab === id ? "page" : undefined}
              className="flex flex-1 flex-col items-center gap-[3px] pb-1 pt-1.5 text-[10px] font-medium tracking-[0.01em]" style={{ color: tab === id ? "#007AFF" : "#8E8E93" }}>
              <TabIcon name={id as TabIconName} active={tab === id} />
              {label}
            </button>
          ))}
          <NotificationBell tab refreshKey={refreshKey + version} onNavigate={setTab} />
          <HamburgerMenu tab tabActive={tab === "profile" || tab === "history"} user={user} light={light} setLight={pickTheme} onHistory={() => setTab("history")} onSignOut={() => void signOut()}
            sections={TABS} current={tab} onSection={(id) => setTab(id as Tab)} />
        </nav>
      )}
      <aside className="flex shrink-0 flex-col gap-6 md:sticky md:top-10 md:h-[calc(100vh-5rem)] md:w-56">
        <div className="relative flex items-center justify-between">
          <div className="hidden md:block"><Logo /></div>
          {/* Phones: a greeting instead of the logo. */}
          <div className="min-w-0 md:hidden">
            <p className="truncate text-2xl text-ink">Hello {user.name.trim().split(/\s+/)[0] || user.username},</p>
            <p className="text-sm text-ink-muted">{dueNow === null ? "Here is your day" : dueNow > 0 ? "You have work today" : "Nothing due today"}</p>
          </div>
          {/* The Pacewise-style hamburger menu: History, theme, and the account with Log out. */}
          {!phone && (
            <div className="flex items-center gap-2">
              {/* Missed tasks, today's tasks and habit status. */}
              <NotificationBell refreshKey={refreshKey + version} onNavigate={setTab} />
              <HamburgerMenu user={user} light={light} setLight={pickTheme} onHistory={() => setTab("history")} onSignOut={() => void signOut()}
                sections={TABS} current={tab} onSection={(id) => setTab(id as Tab)} />
            </div>
          )}
        </div>
        {/* Phones: these tabs are in the hamburger menu. */}
        <nav className="hidden gap-1 overflow-x-auto md:flex md:flex-col" aria-label="Sections">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button key={id} onClick={() => setTab(id)} aria-current={tab === id ? "page" : undefined}
              className={cn("flex items-center gap-3 whitespace-nowrap rounded-none px-4 py-2 text-sm transition-colors", tab === id ? "bg-ink text-canvas" : "text-ink-muted  ")}>
              <Icon className="h-4 w-4" aria-hidden />
              {label}
            </button>
          ))}
        </nav>
        <div className="mt-auto hidden flex-col gap-3 text-sm text-ink-muted md:flex">
          <button onClick={() => pickTheme(!light)} className="flex items-center gap-2 text-left ">{light ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />} {light ? "Dark" : "Light"} theme</button>
          <div className="border-t border-overlay/10 pt-3">
            <p className="truncate text-ink">{user.name}</p>
            <p className="truncate text-xs text-ink-faint">@{user.username}</p>
            <button onClick={() => void signOut()} className="mt-2 flex items-center gap-2 "><LogOut className="h-4 w-4" /> Sign out</button>
          </div>
        </div>
      </aside>

      <main className="min-w-0 flex-1">
        <div className={cn("mb-6 flex items-center gap-3", tab === "tasks" && "hidden md:flex")}>
          {tab !== "tasks" && (
            <button type="button" onClick={goBack} aria-label="Back" title="Back"
              className="glass-fab flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#3478F6] text-white shadow-themed md:hidden">
              <ArrowLeft className="h-5 w-5" strokeWidth={2} />
            </button>
          )}
          <h1 className="font-display text-3xl">{tab === "history" ? "History" : TABS.find((t) => t.id === tab)?.label}.</h1>
        </div>
        {tab === "tasks" && <TasksPanel onChanged={changed} refreshKey={refreshKey} onOpenHabits={() => setTab("habits")} neet={isNeetAspirant(user)} onDueNow={setDueNow} onOpenCalendar={() => setTab("calendar")} />}
        {tab === "history" && <HistoryPanel day={historyDay} setDay={setHistoryDay} version={version} onChanged={changed} />}
        {tab === "habits" && <HabitsPanel version={version} onChanged={changed} />}
        {tab === "profile" && <ProfilePanel user={user} version={version} onOpenDay={openDay} />}
        {tab === "calendar" && <CalendarPanel userId={user.id} onChanged={changed} />}
      </main>
    </div>
  );
}
