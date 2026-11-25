"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { ArrowLeft, CalendarDays, ListChecks, Target, Sprout, LogOut, Moon, Sun, UserRound } from "lucide-react";
import { Logo } from "@/components/Logo";
import { HamburgerMenu } from "@/components/HamburgerMenu";
import { Tour } from "@/components/Tour";
import { DocsPanel } from "@/components/DocsPanel";
import { TabIcon, type TabIconName } from "@/components/TabIcons";
import { NotificationBell } from "@/components/NotificationBell";
import { WheelSpinner } from "@/components/WheelSpinner";
import { LoginCard } from "@/components/LoginCard";
import { TasksPanel } from "@/components/TasksPanel";
import { PLANNER_DRAFT_KEY } from "@/components/TaskPlanner";
import { HistoryPanel } from "@/components/HistoryPanel";
import { HabitsPanel } from "@/components/HabitsPanel";
import { ProfilePanel } from "@/components/ProfilePanel";
import { GoalSheet, GoalsPanel } from "@/components/GoalsPanel";
import { GoalReviewPanel } from "@/components/GoalReviewPanel";
import { OverduePanel } from "@/components/OverduePanel";
import { CalendarPanel } from "@/components/Calendar/CalendarPanel";
import { api, ApiError, logout, session, type User } from "@/lib/api";
import { today } from "@/lib/days";
import { cn } from "@/lib/utils";
import { isNeetAspirant, isSoftwareEngineer } from "@/lib/neetSyllabus";
import { isPremium, useWallet } from "@/lib/coins";

type Tab = "tasks" | "history" | "habits" | "profile" | "calendar" | "docs" | "goals" | "review" | "overdue";
const TABS: { id: Tab; label: string; icon: typeof ListChecks }[] = [
  { id: "tasks", label: "Tasks", icon: ListChecks },
  // History is in the hamburger menu, not here.
  // Habit tracker: micro to macro habits, habits to quit, and sleep.
  { id: "habits", label: "Habits", icon: Sprout },
  // Goals with a deadline (weekly, monthly, quarterly, yearly) that tasks count toward.
  { id: "goals", label: "Goals", icon: Target },
  { id: "profile", label: "Profile", icon: UserRound },
  // The Pacewise calendar, copied into To-do: it opens here instead of sending you to Pacewise.
  { id: "calendar", label: "Calendar", icon: CalendarDays },
];
const THEME_KEY = "pacewise-todo-theme";
/** The gap between two pages side by side during a swipe. */
const PAGE_GAP = 16;
const TAB_IDS: Tab[] = ["tasks", "history", "habits", "profile", "calendar", "docs", "goals", "review", "overdue"];
/** Where ← goes when there is no earlier section in this visit (the app was opened straight on this one). */
const PARENT: Partial<Record<Tab, Tab>> = { review: "profile", overdue: "profile" };
/** How many sections deep this visit is (kept across reloads), so ← steps back inside the app and never leaves it. */
const DEPTH_KEY = "pacewise-todo-depth";
const depth = { get: () => { try { return Number(sessionStorage.getItem(DEPTH_KEY)) || 0; } catch { return 0; } }, set: (n: number) => { try { sessionStorage.setItem(DEPTH_KEY, String(Math.max(0, n))); } catch { /* storage blocked */ } } };
/** The theme the person picked (saved only when they pick one). Without a choice: light on phones, dark on wider screens. */
const THEME_CHOICE_KEY = "pacewise-todo-theme-choice";
const isPhone = () => window.matchMedia("(max-width: 767px)").matches;

export function TodoApp() {
  const [user, setUser] = useState<User | null>(null);
  const [checking, setChecking] = useState(true);
  /** The open section; after a reload, the one this history entry was on (so a refresh never drops you on Tasks). */
  const [tab, setTab] = useState<Tab>(() => {
    if (typeof window === "undefined") return "tasks";
    const t = (window.history.state as { todoTab?: Tab } | null)?.todoTab;
    return t && TAB_IDS.includes(t) ? t : "tasks";
  });
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
  /** Opening a day (a bar or a square on the Profile) starts the day page at its top, not where the Profile was scrolled to. */
  const openDay = useCallback((day: string) => {
    setHistoryDay(day);
    setTab("history");
    window.scrollTo({ top: 0, left: 0, behavior: "instant" as ScrollBehavior });
    requestAnimationFrame(() => window.scrollTo({ top: 0, left: 0, behavior: "instant" as ScrollBehavior }));
  }, []);
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
      depth.set(depth.get() - 1);
      setTab((e.state as { todoTab?: Tab } | null)?.todoTab ?? "tasks");
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
  useEffect(() => {
    if (fromBack.current) { fromBack.current = false; return; }
    if ((window.history.state as { todoTab?: Tab } | null)?.todoTab !== tab) { window.history.pushState({ todoTab: tab }, ""); depth.set(depth.get() + 1); }
  }, [tab]);
  /** ← like Apple's Back: the section you came from; with none in this visit, the section this one belongs to. */
  const goBack = useCallback(() => {
    if ((window.history.state as { todoTab?: Tab } | null)?.todoTab && depth.get() > 0) window.history.back();
    else setTab((t) => PARENT[t] ?? "tasks");
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
  /**
   * Phones: swipe left / right on the page to go to the next / previous tab of the bottom bar, the way iOS pages move:
   * the page follows the finger once the swipe is clearly sideways (vertical scrolling is left alone), it resists at
   * the first and last tab, and on release it either springs back or slides out while the next tab slides in. A quick
   * flick is enough; a slow drag has to pass a third of the screen. A swipe that starts in something that scrolls
   * sideways (a grid, the task sheet) or in a field stays there. Native listeners on <main>, so swipes inside pop-ups
   * and sheets (portals) never switch tabs. The page moves with `left` (not a transform), so fixed buttons stay put.
   */
  const mainRef = useRef<HTMLElement>(null);
  const pagesRef = useRef<HTMLDivElement>(null);
  /** The next section, drawn beside the open one while a swipe is under way (`top`: lined up with the screen's top). */
  const [peek, setPeek] = useState<{ tab: Tab; dir: 1 | -1; top: number } | null>(null);
  const peekRef = useRef<{ tab: Tab; dir: 1 | -1; top: number } | null>(null);
  const tabRef = useRef(tab);
  tabRef.current = tab;
  useEffect(() => {
    const el = mainRef.current;
    if (!phone || !el) return;
    const order: Tab[] = ["tasks", "habits", "calendar", "profile"];
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const EASE = "cubic-bezier(0.25, 1, 0.5, 1)";
    let g: { x: number; y: number; lock: "x" | "y" | null; dx: number; vx: number; lastX: number; lastT: number } | null = null;
    let animating = false;

    const scrollsSideways = (n: EventTarget | null) => {
      for (let e = n instanceof Element ? n : null; e && e !== el; e = e.parentElement) {
        if (e.matches("input, textarea, select, [contenteditable=true], [role=slider]")) return true;
        const ox = getComputedStyle(e).overflowX;
        if ((ox === "auto" || ox === "scroll") && e.scrollWidth > e.clientWidth + 1) return true;
      }
      return false;
    };
    const place = (x: number, ms = 0, ease = EASE) => {
      el.style.transition = ms ? `left ${ms}ms ${ease}, opacity ${ms}ms ${ease}` : "none";
      el.style.position = "relative";
      el.style.left = `${x}px`;
    };
    /**
     * While a swipe moves the pages, nothing may widen the page: `clip` on both html and body (a phone widens its layout,
     * and zooms out, for anything sticking out sideways unless both are clipped).
     */
    const lockX = (on: boolean) => { for (const n of [document.documentElement, document.body]) n.style.overflowX = on ? "clip" : ""; };
    const clear = () => { el.style.transition = ""; el.style.left = ""; el.style.position = ""; el.style.opacity = ""; lockX(false); };
    // Anything an earlier swipe (or an older version of the app) left behind is cleared first.
    clear();
    /** Draws (or removes) the neighbouring section beside the open one. */
    const showPeek = (next: Tab | undefined, dir: 1 | -1) => {
      if (reduced) return;
      if (!next) { if (peekRef.current) { peekRef.current = null; flushSync(() => setPeek(null)); } return; }
      if (peekRef.current?.tab === next) return;
      const r = pagesRef.current?.getBoundingClientRect();
      const v = { tab: next, dir, top: r ? Math.max(0, -r.top) : 0 };
      peekRef.current = v;
      flushSync(() => setPeek(v));
    };
    const dropPeek = () => { peekRef.current = null; setPeek(null); };
    const after = (ms: number, fn: () => void) => window.setTimeout(fn, ms);
    /** iOS-style rubber band past the first / last tab. */
    const rubber = (x: number, w: number) => Math.sign(x) * (1 - 1 / ((Math.abs(x) * 0.55) / w + 1)) * w;

    const down = (e: TouchEvent) => {
      if (animating || e.touches.length !== 1 || scrollsSideways(e.target)) { g = null; return; }
      if (!order.includes(tabRef.current)) { g = null; return; }
      const x = e.touches[0].clientX;
      g = { x, y: e.touches[0].clientY, lock: null, dx: 0, vx: 0, lastX: x, lastT: performance.now() };
    };
    const move = (e: TouchEvent) => {
      if (!g || e.touches.length !== 1) return;
      const t = e.touches[0];
      const dx = t.clientX - g.x;
      const dy = t.clientY - g.y;
      if (!g.lock) {
        if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return;
        g.lock = Math.abs(dx) > Math.abs(dy) * 1.2 ? "x" : "y";
        if (g.lock === "x") lockX(true);
      }
      if (g.lock !== "x") return;
      e.preventDefault(); // the page moves sideways, so it must not scroll up / down at the same time
      const now = performance.now();
      const dt = Math.max(1, now - g.lastT);
      g.vx = 0.8 * ((t.clientX - g.lastX) / dt) + 0.2 * g.vx;
      g.lastX = t.clientX;
      g.lastT = now;
      g.dx = dx;
      const i = order.indexOf(tabRef.current);
      const edge = (dx > 0 && i === 0) || (dx < 0 && i === order.length - 1);
      // WhatsApp-style: the next section is right there beside this one, moving with the finger.
      showPeek(edge ? undefined : order[i + (dx < 0 ? 1 : -1)], dx < 0 ? 1 : -1);
      if (!reduced) place(edge ? rubber(dx, el.clientWidth) : dx);
    };
    const up = () => {
      const s = g;
      g = null;
      if (!s || s.lock !== "x") return;
      const w = el.clientWidth;
      const i = order.indexOf(tabRef.current);
      const dir = s.dx < 0 ? 1 : -1;
      const next = order[i + dir];
      const flick = Math.abs(s.vx) > 0.35 && Math.sign(s.vx) === Math.sign(s.dx);
      const go = !!next && (Math.abs(s.dx) > w / 3 || flick);
      if (!go) {
        if (reduced) { clear(); dropPeek(); return; }
        animating = true;
        place(0, 380, "cubic-bezier(0.34, 1.3, 0.64, 1)"); // a soft spring back (the next section slides back out with it)
        after(390, () => { clear(); dropPeek(); animating = false; });
        return;
      }
      if (reduced) { clear(); dropPeek(); setTab(next); return; }
      animating = true;
      // Both pages glide on together, at about the finger's speed, until the next one fills the screen; it then simply
      // becomes the open section (the same page, not drawn again), lined up where it was.
      const dist = w + PAGE_GAP;
      const out = Math.min(300, Math.max(160, (dist - Math.abs(s.dx)) / Math.max(0.8, Math.abs(s.vx))));
      showPeek(next, dir as 1 | -1);
      place(-dir * dist, out);
      after(out, () => {
        const top = peekRef.current?.top ?? 0;
        el.style.transition = "none";
        flushSync(() => { peekRef.current = null; setPeek(null); setTab(next); });
        clear();
        if (top > 0) window.scrollTo(0, Math.max(0, window.scrollY - top));
        animating = false;
      });
    };
    const cancel = () => {
      if (g?.lock === "x" && !reduced) { animating = true; place(0, 300); after(310, () => { clear(); dropPeek(); animating = false; }); }
      g = null;
    };
    el.addEventListener("touchstart", down, { passive: true });
    el.addEventListener("touchmove", move, { passive: false });
    el.addEventListener("touchend", up, { passive: true });
    el.addEventListener("touchcancel", cancel, { passive: true });
    return () => {
      el.removeEventListener("touchstart", down); el.removeEventListener("touchmove", move);
      el.removeEventListener("touchend", up); el.removeEventListener("touchcancel", cancel);
      clear();
    };
  }, [phone, user, checking]);
  /** The guided tour (More → Take the tour). */
  const [touring, setTouring] = useState(false);
  /** "New goal" in the menu: the goal sheet, wherever you are. */
  const [newGoal, setNewGoal] = useState(false);
  /** Open tasks due now (today + overdue), for the phone greeting; null until the task list has loaded. */
  const [dueNow, setDueNow] = useState<number | null>(null);

  if (checking) return <div className="relative min-h-screen"><WheelSpinner label="Signing you in" /></div>;
  if (!user) return <LoginCard onSignedIn={setUser} />;

  /** One section's page: its title row and its panel. `peekOnly`: drawn beside the open one during a swipe. */
  const renderPage = (t: Tab, peekOnly: boolean) => (
    <>
      <div className={cn("mb-6 flex items-center gap-3", t === "tasks" && "hidden md:flex")}>
        {t !== "tasks" && (
          <button type="button" onClick={goBack} aria-label="Back" title="Back"
            className="glass-fab flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#3478F6] text-white shadow-themed md:hidden">
            <ArrowLeft className="h-5 w-5" strokeWidth={2} />
          </button>
        )}
        <h1 className="font-display text-3xl">{t === "history" ? "History" : t === "docs" ? "Tour" : t === "review" ? "Goal review" : t === "overdue" ? "Overdue" : TABS.find((x) => x.id === t)?.label}.</h1>
      </div>
      {t === "tasks" && <TasksPanel onChanged={changed} refreshKey={refreshKey} onOpenHabits={() => setTab("habits")} onOpenGoals={() => setTab("goals")} neet={isNeetAspirant(user)} cse={isSoftwareEngineer(user)} onDueNow={peekOnly ? undefined : setDueNow} onOpenCalendar={() => setTab("calendar")} />}
      {t === "history" && <HistoryPanel day={historyDay} setDay={setHistoryDay} version={version} onChanged={changed} />}
      {t === "habits" && <HabitsPanel version={version} onChanged={changed} />}
      {t === "review" && <GoalReviewPanel version={version} />}
      {t === "overdue" && <OverduePanel version={version} />}
      {t === "goals" && <GoalsPanel version={version} onChanged={changed} />}
      {t === "profile" && <ProfilePanel user={user} version={version} onOpenDay={openDay} onOpenGoals={() => setTab("review")} onOpenOverdue={() => setTab("overdue")} />}
      {t === "calendar" && <CalendarPanel userId={user.id} onChanged={changed} />}
      {t === "docs" && <DocsPanel onTour={() => setTouring(true)} />}
    </>
  );

  return (
    // overflow-x: clip, always: nothing in the app (a page sliding in during a swipe included) can make the page wider
    // than the screen, so a phone never zooms out and the fixed tab bar never moves. (clip is not a scroll box: fixed
    // and sticky parts keep working.)
    <div className="flex min-h-screen w-full flex-col gap-6 overflow-x-clip px-4 py-6 max-md:pb-28 sm:px-6 md:flex-row md:gap-10 md:px-10 md:py-10">
      {/* Phones: a tab bar at the bottom — the sections, notifications, and More (Profile, History, theme, log out). */}
      {newGoal && <GoalSheet onClose={() => setNewGoal(false)} onSaved={() => changed()} />}
      {touring && <Tour onClose={() => setTouring(false)} goTasks={() => setTab("tasks")} />}
      {phone && (
        <nav aria-label="Sections" data-tour="tabs" className="pw-tabbar fixed inset-x-0 bottom-0 z-50 flex px-1 pb-[max(0.25rem,env(safe-area-inset-bottom))]">
          {/* Tasks, Habits, Calendar, Profile; the Tour guide is in More. */}
          {(["tasks", "habits", "calendar", "profile"] as Tab[]).map((id) => TABS.find((t) => t.id === id)!).map(({ id, label }) => (
            <button key={id} type="button" onClick={() => setTab(id)} aria-current={tab === id ? "page" : undefined} aria-label={label} title={label}
              className="flex flex-1 items-center justify-center py-2 outline-none [-webkit-tap-highlight-color:transparent] focus-visible:[&>span]:ring-2 focus-visible:[&>span]:ring-[#3478F6]/50" style={{ color: tab === id ? "#3478F6" : "#8C8F98" }}>
              {/* Icons only: the open tab sits on a soft blue pill, and the icon springs a little when pressed. */}
              <span className={cn("grid h-10 w-14 place-items-center rounded-full transition-[background-color,transform] duration-200 active:scale-90", tab === id && "bg-[#3478F6]/[0.12]")}>
                <TabIcon name={(id === "docs" ? "tour" : id) as TabIconName} active={tab === id} className="h-[27px] w-[27px]" />
              </span>
            </button>
          ))}
          <HamburgerMenu tab tabActive={tab === "history" || tab === "docs"} user={user} light={light} setLight={pickTheme} onHistory={() => setTab("history")} onSignOut={() => void signOut()} onNewGoal={() => setNewGoal(true)}
            sections={TABS} current={tab} onSection={(id) => setTab(id as Tab)} onTour={() => setTab("docs")} />
        </nav>
      )}
      <aside className="flex shrink-0 flex-col gap-6 md:sticky md:top-10 md:h-[calc(100vh-5rem)] md:w-56">
        <div className="relative flex items-center justify-between">
          <div className="hidden md:block"><Logo /></div>
          {/* Phones: a greeting instead of the logo. */}
          <div className="min-w-0 md:hidden">
            <p className="flex min-w-0 items-center text-2xl text-ink"><span className="truncate">Hello {user.name.trim().split(/\s+/)[0] || user.username},</span><PremiumCrown version={version} /></p>
            <p className="text-sm text-ink-muted">{dueNow === null ? "Here is your day" : dueNow > 0 ? "You have work today" : "Nothing due today"}</p>
          </div>
          {/* The Pacewise-style hamburger menu: History, theme, and the account with Log out. */}
          {/* Phones: only the bell up here (the menu is "More" in the tab bar). */}
          {phone && <NotificationBell refreshKey={refreshKey + version} onNavigate={setTab} />}
          {!phone && (
            <div className="flex items-center gap-2">
              {/* Missed tasks, today's tasks and habit status. */}
              <NotificationBell refreshKey={refreshKey + version} onNavigate={setTab} />
              <HamburgerMenu user={user} light={light} setLight={pickTheme} onHistory={() => setTab("history")} onSignOut={() => void signOut()} onNewGoal={() => setNewGoal(true)}
                sections={TABS} current={tab} onSection={(id) => setTab(id as Tab)} onTour={() => setTab("docs")} />
            </div>
          )}
        </div>
        {/* Phones: these tabs are in the hamburger menu. */}
        <nav data-tour="tabs" className="hidden gap-1 overflow-x-auto md:flex md:flex-col" aria-label="Sections">
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

      <main ref={mainRef} className="min-w-0 flex-1">
        {/*
          The open section, and while a swipe is under way the next one beside it (WhatsApp-style: both move with the
          finger). Each page is keyed by its section, so when the swipe lands the page that slid in simply stays.
        */}
        <div ref={pagesRef} className="relative">
          {[{ t: tab, isPeek: false }, ...(peek && peek.tab !== tab ? [{ t: peek.tab, isPeek: true }] : [])].map(({ t: pt, isPeek }) => (
            <div key={pt} aria-hidden={isPeek || undefined} {...(isPeek ? ({ inert: "" } as Record<string, string>) : {})}
              className={isPeek ? "pw-peek pointer-events-none absolute w-full" : undefined}
              style={isPeek && peek ? { top: peek.top, left: peek.dir > 0 ? `calc(100% + ${PAGE_GAP}px)` : `calc(-100% - ${PAGE_GAP}px)` } : undefined}>
              {renderPage(pt, isPeek)}
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}

/**
 * Premium members: a refined gold crown beside the name in the greeting, drawn to match the gold coin (a warm metal
 * gradient with a fine darker edge), sized to the text and set on its cap height. Nothing for everyone else.
 */
function PremiumCrown({ version }: { version: number }) {
  const { wallet } = useWallet(version);
  if (!isPremium(wallet)) return null;
  return (
    <span className="ml-2 inline-flex shrink-0 -translate-y-[0.12em] items-center" title="Premium member" role="img" aria-label="Premium member">
      <svg viewBox="0 0 24 20" className="h-[0.72em] w-auto drop-shadow-[0_1px_1.5px_rgba(160,105,0,0.35)]" aria-hidden>
        <defs>
          <linearGradient id="pw-crown-gold" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#FFE58A" />
            <stop offset="0.55" stopColor="#F2BC2E" />
            <stop offset="1" stopColor="#C98A06" />
          </linearGradient>
        </defs>
        {/* the crown: five points over a band, three jewels on the points */}
        <path d="M2.2 6.2l4.9 4.3L12 2.6l4.9 7.9 4.9-4.3-1.9 10.3H4.1z" fill="url(#pw-crown-gold)" stroke="#B07A08" strokeWidth="1" strokeLinejoin="round" />
        <rect x="4" y="16.9" width="16" height="2.4" rx="1.1" fill="url(#pw-crown-gold)" stroke="#B07A08" strokeWidth="0.9" />
        <circle cx="12" cy="2.6" r="1.6" fill="#FFF3C4" stroke="#B07A08" strokeWidth="0.8" />
        <circle cx="2.2" cy="6.2" r="1.35" fill="#FFF3C4" stroke="#B07A08" strokeWidth="0.8" />
        <circle cx="21.8" cy="6.2" r="1.35" fill="#FFF3C4" stroke="#B07A08" strokeWidth="0.8" />
      </svg>
    </span>
  );
}
