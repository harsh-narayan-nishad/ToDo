"use client";
import { useCallback, useEffect, useState } from "react";
import { CalendarDays, ListChecks, Sprout, LogOut, Moon, Sun, UserRound } from "lucide-react";
import { Logo } from "@/components/Logo";
import { HamburgerMenu } from "@/components/HamburgerMenu";
import { NotificationBell } from "@/components/NotificationBell";
import { WheelSpinner } from "@/components/WheelSpinner";
import { LoginCard } from "@/components/LoginCard";
import { TasksPanel } from "@/components/TasksPanel";
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

export function TodoApp() {
  const [user, setUser] = useState<User | null>(null);
  const [checking, setChecking] = useState(true);
  const [tab, setTab] = useState<Tab>("tasks");
  const [historyDay, setHistoryDay] = useState(today());
  const [light, setLight] = useState(false);
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
      try { setLight(localStorage.getItem(THEME_KEY) === "light"); } catch { /* storage blocked */ }
      setChecking(false);
    })();
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", light ? "light" : "dark");
    try { localStorage.setItem(THEME_KEY, light ? "light" : "dark"); } catch { /* storage blocked */ }
  }, [light]);

  const signOut = useCallback(async () => { await logout(); setUser(null); setTab("tasks"); }, []);
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

  if (checking) return <div className="relative min-h-screen"><WheelSpinner label="Signing you in" /></div>;
  if (!user) return <LoginCard onSignedIn={setUser} />;

  return (
    <div className="flex min-h-screen w-full flex-col gap-6 px-4 py-6 sm:px-6 md:flex-row md:gap-10 md:px-10 md:py-10">
      <aside className="flex shrink-0 flex-col gap-6 md:sticky md:top-10 md:h-[calc(100vh-5rem)] md:w-56">
        <div className="relative flex items-center justify-between">
          <Logo />
          {/* The Pacewise-style hamburger menu: History, theme, and the account with Log out. */}
          <div className="flex items-center gap-2">
            {/* Missed tasks, today's tasks and habit status. */}
            <NotificationBell refreshKey={refreshKey + version} onNavigate={setTab} />
            <HamburgerMenu user={user} light={light} setLight={setLight} onHistory={() => setTab("history")} onSignOut={() => void signOut()} />
          </div>
        </div>
        <nav className="flex gap-1 overflow-x-auto md:flex-col" aria-label="Sections">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button key={id} onClick={() => setTab(id)} aria-current={tab === id ? "page" : undefined}
              className={cn("flex items-center gap-3 whitespace-nowrap rounded-none px-4 py-2 text-sm transition-colors", tab === id ? "bg-ink text-canvas" : "text-ink-muted  ")}>
              <Icon className="h-4 w-4" aria-hidden />
              {label}
            </button>
          ))}
        </nav>
        <div className="mt-auto hidden flex-col gap-3 text-sm text-ink-muted md:flex">
          <button onClick={() => setLight(!light)} className="flex items-center gap-2 text-left ">{light ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />} {light ? "Dark" : "Light"} theme</button>
          <div className="border-t border-overlay/10 pt-3">
            <p className="truncate text-ink">{user.name}</p>
            <p className="truncate text-xs text-ink-faint">@{user.username}</p>
            <button onClick={() => void signOut()} className="mt-2 flex items-center gap-2 "><LogOut className="h-4 w-4" /> Sign out</button>
          </div>
        </div>
      </aside>

      <main className="min-w-0 flex-1">
        <h1 className="mb-6 font-display text-3xl">{tab === "history" ? "History" : TABS.find((t) => t.id === tab)?.label}.</h1>
        {tab === "tasks" && <TasksPanel onChanged={changed} refreshKey={refreshKey} onOpenHabits={() => setTab("habits")} neet={isNeetAspirant(user)} />}
        {tab === "history" && <HistoryPanel day={historyDay} setDay={setHistoryDay} version={version} onChanged={changed} />}
        {tab === "habits" && <HabitsPanel version={version} onChanged={changed} />}
        {tab === "profile" && <ProfilePanel user={user} version={version} onOpenDay={openDay} />}
        {tab === "calendar" && <CalendarPanel userId={user.id} onChanged={changed} />}
      </main>
    </div>
  );
}
