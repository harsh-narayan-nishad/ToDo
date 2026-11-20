"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { CalendarDays, History, ListChecks, LogOut, Menu, Moon, Sun, UserRound, X } from "lucide-react";
import { Logo } from "@/components/Logo";
import { WheelSpinner } from "@/components/WheelSpinner";
import { LoginCard } from "@/components/LoginCard";
import { TasksPanel } from "@/components/TasksPanel";
import { HistoryPanel } from "@/components/HistoryPanel";
import { ProfilePanel } from "@/components/ProfilePanel";
import { api, ApiError, logout, PACEWISE_URL, session, type User } from "@/lib/api";
import { today } from "@/lib/days";
import { cn } from "@/lib/utils";

type Tab = "tasks" | "history" | "profile";
const TABS: { id: Tab; label: string; icon: typeof ListChecks }[] = [
  { id: "tasks", label: "Tasks", icon: ListChecks },
  { id: "history", label: "History", icon: History },
  { id: "profile", label: "Profile", icon: UserRound },
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
  /** Phone/tablet only: theme and sign-in details live behind the hamburger button. */
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: PointerEvent) => { if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setMenuOpen(false); };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("pointerdown", onDown); document.removeEventListener("keydown", onKey); };
  }, [menuOpen]);
  const openDay = useCallback((day: string) => { setHistoryDay(day); setTab("history"); }, []);

  if (checking) return <div className="relative min-h-screen"><WheelSpinner label="Signing you in" /></div>;
  if (!user) return <LoginCard onSignedIn={setUser} />;

  return (
    <div className="flex min-h-screen w-full flex-col gap-6 px-4 py-6 sm:px-6 md:flex-row md:gap-10 md:px-10 md:py-10">
      <aside className="flex shrink-0 flex-col gap-6 md:sticky md:top-10 md:h-[calc(100vh-5rem)] md:w-56">
        <div ref={menuRef} className="relative flex items-center justify-between">
          <Logo />
          <button onClick={() => setMenuOpen((o) => !o)} aria-label={menuOpen ? "Close menu" : "Open menu"} aria-expanded={menuOpen} aria-controls="account-menu"
            className="p-2 text-ink-muted transition-colors hover:bg-overlay/5 hover:text-ink md:hidden">
            {menuOpen ? <X className="h-5 w-5" aria-hidden /> : <Menu className="h-5 w-5" aria-hidden />}
          </button>
          {menuOpen && (
            <div id="account-menu" className="absolute right-0 top-full z-50 mt-2 flex w-64 max-w-[calc(100vw-2rem)] flex-col gap-3 border border-overlay/10 bg-canvas-raised p-4 text-sm text-ink-muted shadow-themed md:hidden">
              <div>
                <p className="truncate text-ink">{user.name}</p>
                <p className="truncate text-xs text-ink-faint">@{user.username}</p>
              </div>
              <div className="flex flex-col gap-3 border-t border-overlay/10 pt-3">
                <button onClick={() => setLight(!light)} className="flex items-center gap-2 text-left hover:text-ink">{light ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />} {light ? "Dark" : "Light"} theme</button>
                <button onClick={() => { setMenuOpen(false); void signOut(); }} className="flex items-center gap-2 text-left hover:text-ink"><LogOut className="h-4 w-4" /> Sign out</button>
              </div>
            </div>
          )}
        </div>
        <nav className="flex gap-1 overflow-x-auto md:flex-col" aria-label="Sections">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button key={id} onClick={() => setTab(id)} aria-current={tab === id ? "page" : undefined}
              className={cn("flex items-center gap-3 whitespace-nowrap rounded-none px-4 py-2 text-sm transition-colors", tab === id ? "bg-ink text-canvas" : "text-ink-muted hover:bg-overlay/5 hover:text-ink")}>
              <Icon className="h-4 w-4" aria-hidden />
              {label}
            </button>
          ))}
          <a href={PACEWISE_URL} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 whitespace-nowrap rounded-none px-4 py-2 text-sm text-ink-muted transition-colors hover:bg-overlay/5 hover:text-ink">
            <CalendarDays className="h-4 w-4" aria-hidden /> Pacewise calendar
          </a>
        </nav>
        <div className="mt-auto hidden flex-col gap-3 text-sm text-ink-muted md:flex">
          <button onClick={() => setLight(!light)} className="flex items-center gap-2 text-left hover:text-ink">{light ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />} {light ? "Dark" : "Light"} theme</button>
          <div className="border-t border-overlay/10 pt-3">
            <p className="truncate text-ink">{user.name}</p>
            <p className="truncate text-xs text-ink-faint">@{user.username}</p>
            <button onClick={() => void signOut()} className="mt-2 flex items-center gap-2 hover:text-ink"><LogOut className="h-4 w-4" /> Sign out</button>
          </div>
        </div>
      </aside>

      <main className="min-w-0 flex-1">
        <h1 className="mb-6 font-display text-3xl">{TABS.find((t) => t.id === tab)?.label}.</h1>
        {tab === "tasks" && <TasksPanel onChanged={changed} refreshKey={refreshKey} />}
        {tab === "history" && <HistoryPanel day={historyDay} setDay={setHistoryDay} version={version} onChanged={changed} />}
        {tab === "profile" && <ProfilePanel user={user} version={version} onOpenDay={openDay} />}
      </main>
    </div>
  );
}
