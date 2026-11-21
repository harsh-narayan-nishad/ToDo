"use client";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { today } from "@/lib/days";
import { PLANNER_DRAFT_KEY } from "@/components/TaskPlanner";
import { tourState, tourTasks } from "@/lib/tour";

/**
 * The guided tour (More → Take the tour). It plays by itself: a spotlight moves over the real app while a small card
 * says what is happening, and it adds one real task through the task planner, exactly as a person would
 * (+ → type a title → today only → Add). "Skip" stops it at any step. A planner draft the person had is put aside
 * during the tour and given back afterwards. Every run adds a new task (numbered after the first).
 */
const TOUR_TITLE = "Try Pacewise To-do";
const STEPS = 17;

interface Card { title: string; body: string; target?: string; n?: number; intro?: boolean; final?: boolean; /** Shows the OK button: the tour waits for it. */ ok?: boolean; /** "Required" / "Optional" next to a field's name. */ tag?: "Required" | "Optional" }
type Rect = { top: number; left: number; width: number; height: number };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
/** The first element for `sel` that is actually on screen (phones and desktop have different copies of some parts). */
const shown = (sel: string) => [...document.querySelectorAll<HTMLElement>(sel)].find((el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; });
async function waitFor(sel: string, alive: () => boolean, ms = 6000): Promise<HTMLElement | null> {
  for (let t = 0; t < ms && alive(); t += 100) { const el = shown(sel); if (el) return el; await sleep(100); }
  return null;
}
/** Sets an input's value the way typing does, so the app's own handlers see it. */
function setValue(el: HTMLInputElement, value: string) {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(el, value);
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
}
const draftNow = () => { try { return localStorage.getItem(PLANNER_DRAFT_KEY); } catch { return null; } };
const putDraft = (v: string | null) => { try { if (v === null) localStorage.removeItem(PLANNER_DRAFT_KEY); else localStorage.setItem(PLANNER_DRAFT_KEY, v); } catch { /* storage blocked */ } };

export function Tour({ onClose, goTasks }: { onClose: () => void; goTasks: () => void }) {
  const [card, setCard] = useState<Card>({ intro: true, title: "Welcome to Pacewise To-do", body: "A quick tour: we will add your first task together, step by step. It takes about 20 seconds." });
  const [rect, setRect] = useState<Rect | null>(null);
  const live = useRef(true);
  const stash = useRef<string | null | undefined>(undefined);
  const plannerOpen = useRef(false);
  const alive = () => live.current;
  /** Each step waits for the person to tap OK before the tour does it. */
  const okRef = useRef<(() => void) | null>(null);
  const waitOk = () => new Promise<void>((resolve) => { okRef.current = resolve; });
  const ok = () => { const r = okRef.current; okRef.current = null; r?.(); };

  // Keep the spotlight on its target while things move (the planner opening, scrolling, the keyboard on phones).
  useEffect(() => {
    if (!card.target) { setRect(null); return; }
    const sel = card.target;
    const tick = () => {
      const el = shown(sel);
      if (!el) return;
      const r = el.getBoundingClientRect();
      setRect((p) => (p && Math.abs(p.top - r.top) < 0.5 && Math.abs(p.left - r.left) < 0.5 && p.width === r.width && p.height === r.height ? p : { top: r.top, left: r.left, width: r.width, height: r.height }));
    };
    tick();
    const id = window.setInterval(tick, 120);
    return () => window.clearInterval(id);
  }, [card.target]);

  /** Ends the tour: closes the planner if the tour left it open, and gives back the person's own planner draft. */
  const finish = () => {
    live.current = false;
    tourState.virtual = false;
    window.dispatchEvent(new Event("pw-tour-end")); // a practice task left on screen (tour skipped) is removed
    ok(); // let a waiting step end (it sees the tour has stopped)
    tourTasks.clear(); // a tour task left behind (tour skipped) is an ordinary task from now on
    if (plannerOpen.current && shown('[aria-label="Task planner"]')) window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    if (stash.current !== undefined) putDraft(stash.current);
    onClose();
  };
  // (Re)arm on mount: React's development mode mounts, unmounts and mounts again, which must not stop the tour.
  useEffect(() => { live.current = true; return () => { live.current = false; }; }, []);

  /**
   * The virtual tour never stops. Its practice task is made on this screen only (never sent to the server), so no rule,
   * no clock time and no connection problem can refuse it. A step whose part of the screen cannot be found is
   * skipped, and anything unexpected moves the tour on to its next part.
   */
  const SKIP = useRef(new Error("tour-skip")).current;
  const need = <T,>(x: T | null | undefined): T => { if (!x) throw SKIP; return x; };

  async function play() {
    tourState.virtual = true;
    stash.current = draftNow();
    putDraft(null); // the planner opens fresh for the tour
    goTasks();
    window.scrollTo({ top: 0, behavior: "smooth" });
    const now = today();
    const name = TOUR_TITLE;
    const P = '[aria-label="Task planner"]';

    // ---- The planner: + , what its parts do, every column of a row, the preview, Add ----
    try {
      // 1. The + button
      const add = need(await waitFor('[data-tour="add"]', alive));
      setCard({ n: 1, ok: true, title: "Add tasks with +", body: "Every task starts here: one task or a whole plan. Tap OK and the tour opens it.", target: '[data-tour="add"]' });
      await waitOk();
      if (!alive()) return;
      add.click();
      plannerOpen.current = true;

      // 2–3. What the planner's parts do (only explained; nothing is changed)
      const explain: [string, string, string][] = [
        [`${P} [data-tour="range"]`, "Range", "The days this plan covers: this week, the next 7 days, this month, or your own dates."],
        [`${P} [data-tour="repeat"]`, "Repeat", "How often the tasks repeat in that range: every day, weekdays, once a week, every few days… Each row can also have its own repeat."],
      ];
      for (const [i, [target, heading, body]] of explain.entries()) {
        const el = await waitFor(target, alive);
        if (!el) continue; // not on screen: skip this one
        el.scrollIntoView({ block: "center", behavior: "smooth" });
        setCard({ n: 2 + i, ok: true, title: heading, body, target });
        await waitOk();
        if (!alive()) return;
      }

      // 4–11. Every column of the row: what it is, whether it is required, and the tour fills it in.
      const cell = async (c: string) => {
        const el = await waitFor(`${P} ${c}`, alive);
        el?.scrollIntoView({ block: "center", inline: "center", behavior: "smooth" });
        return el;
      };
      const step = async (n: number, target: string, heading: string, tag: "Required" | "Optional", body: string) => {
        setCard({ n, ok: true, title: heading, tag, body, target: `${P} ${target}` });
        await waitOk();
        return alive();
      };
      const typeInto = async (el: HTMLInputElement, text: string) => {
        for (let i = 1; i <= text.length && alive(); i++) { setValue(el, text.slice(0, i)); await sleep(45); }
      };

      // Title (required): without it nothing can be added, so the planner part ends here if it is missing
      const title = need((await cell('[data-cell="0-0"]')) as HTMLInputElement | null);
      if (!(await step(4, '[data-cell="0-0"]', "Title", "Required", "What needs doing. The only thing a task must have. Things you add are suggested again next time. Tap OK and the tour types one."))) return;
      await typeInto(title, name);
      title.focus(); title.blur(); // closes the suggestion list
      await sleep(500);

      // Notes (optional)
      const notes = (await cell('[data-cell="0-1"]')) as HTMLInputElement | null;
      if (notes) {
        if (!(await step(5, '[data-cell="0-1"]', "Notes", "Optional", "Details, links or steps for the task. Tap OK and the tour adds a short note."))) return;
        await typeInto(notes, "Added by the tour");
        await sleep(400);
      }

      // Priority (optional)
      const prio = await cell('[data-cell="0-2"]');
      if (prio) {
        if (!(await step(6, '[data-cell="0-2"]', "Priority", "Optional", "Low, Medium or High. It is Medium unless you change it. Tap OK and the tour sets High."))) return;
        prio.click();
        const high = await waitFor('[role="listbox"] [role="option"]', alive, 2000);
        const pick = [...document.querySelectorAll<HTMLElement>('[role="listbox"] [role="option"]')].find((o) => o.textContent?.trim() === "High");
        if (high && pick) pick.click(); else window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
        await sleep(400);
      }

      // Date (optional): today, so the tour adds exactly one task
      const date = (await cell('[data-cell="0-3"]')) as HTMLInputElement | null;
      if (date) {
        if (!(await step(7, '[data-cell="0-3"]', "Date", "Optional", "A date adds the task on that day only. Left empty, it repeats on the plan's days (Range and Repeat). Tap OK to set today, so this adds exactly one task."))) return;
        setValue(date, now);
        await sleep(500);
      }

      // All day (optional)
      const allDay = (await cell('input[aria-label="Row 1 all day"]')) as HTMLInputElement | null;
      if (allDay) {
        if (!(await step(8, 'input[aria-label="Row 1 all day"] + span', "All day", "Optional", "Ticked, the task has no set time. Untick it to give it a time slot. Tap OK and the tour unticks it."))) return;
        if (allDay.checked) allDay.click();
        await sleep(500);
      }

      // From and To (optional): always 9–10 AM in the tour (its practice task is exempt from the "already passed" rule)
      const setTime = async (el: HTMLInputElement, label: string) => { el.focus(); await sleep(30); setValue(el, label); await sleep(60); el.blur(); await sleep(300); };
      const fromEl = (await cell('[data-cell="0-4"]')) as HTMLInputElement | null;
      if (fromEl) {
        if (!(await step(9, '[data-cell="0-4"]', "From", "Optional", "When it starts. Tap OK and the tour sets 9:00 AM (you can also use the clock button)."))) return;
        await setTime(fromEl, "9:00 AM");
      }
      const toEl = (await cell('[data-cell="0-5"]')) as HTMLInputElement | null;
      if (toEl) {
        if (!(await step(10, '[data-cell="0-5"]', "To", "Optional", "When it ends. Tap OK and the tour sets 10:00 AM, so the task lasts one hour."))) return;
        await setTime(toEl, "10:00 AM");
      }

      // Repeat (optional)
      if (await cell('[data-cell="0-6"]')) {
        if (!(await step(11, '[data-cell="0-6"]', "Repeat", "Optional", "How often this row repeats in the plan. With a Date it is Once, as here. Without one it follows the plan's Repeat, or its own."))) return;
      }

      // Preview: the calendar at the bottom shows the day(s) the task will be set on
      const preview = await waitFor(`${P} [data-tour="preview"]`, alive);
      if (preview) {
        preview.scrollIntoView({ block: "center", behavior: "smooth" });
        await sleep(400);
        setCard({ n: 12, ok: true, title: "Preview", body: "Everything filled in. This calendar shows the day your task will be set on: the filled-in date is today. With a repeat, every planned day would be filled in here.", target: `${P} [data-tour="preview"]` });
        await waitOk();
        if (!alive()) return;
      }

      // Add (the practice task is made on this screen only)
      const submit = need(await waitFor('[data-tour="planner-add"]', alive));
      submit.scrollIntoView({ block: "nearest", behavior: "smooth" });
      setCard({ n: 13, ok: true, title: "Add it", body: "Your own tasks go to your list and your Pacewise calendar. This one is a practice task: it shows in your list for the tour only and is not saved. Tap OK to add it.", target: '[data-tour="planner-add"]' });
      await waitOk();
      if (!alive()) return;
      submit.click();
      plannerOpen.current = false;
    } catch {
      // A part of the planner could not run: close it and carry on with the rest of the tour.
      if (!alive()) return;
      if (plannerOpen.current && shown(P)) window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
      plannerOpen.current = false;
      await sleep(400);
    }
    if (!alive()) return;

    // ---- The new task in the list, then ticked off (a practice task just disappears) ----
    try {
      const sel = 'li[data-task-id^="tour-"]';
      const task = await waitFor(sel, alive, 6000);
      if (!alive()) return;
      if (task) {
        task.scrollIntoView({ block: "center", behavior: "smooth" });
        setCard({ n: 14, ok: true, title: "Your new task", body: "Tick the box when it is done. Missed one? You can still tick it off the next day.", target: sel });
        await waitOk();
        if (!alive()) return;
        setCard({ n: 15, ok: true, title: "Tick it off", body: "Tap OK and the tour ticks it. Because this is a practice task, it then disappears. Your own tasks go to Done.", target: sel });
        await waitOk();
        if (!alive()) return;
        const box = shown(`${sel} button[aria-label="Mark as done"]`);
        if (box) {
          box.click();
          for (let t = 0; t < 5000 && alive() && shown(sel); t += 100) await sleep(100); // wait for it to slide away
          if (!alive()) return;
        }
      }
    } catch { /* carry on */ }
    if (!alive()) return;

    // ---- Notifications: open the bell and show what is there, and why ----
    try {
      const bell = await waitFor('[data-tour="alerts"]', alive, 1500);
      if (bell) {
        window.scrollTo({ top: 0, behavior: "smooth" });
        await sleep(400);
        setCard({ n: 16, ok: true, title: "Notifications", body: "Notifications keep you on your tasks of the day. They live inside the app (they are not phone pop-ups) and are worked out from your tasks and habits while the app is open. The red number counts the ones you have not seen yet. Tap OK and the tour opens them.", target: '[data-tour="alerts"]' });
        await waitOk();
        if (!alive()) return;
        bell.click();
        const panel = await waitFor('[data-tour="alerts-panel"]', alive, 3000);
        if (!alive()) return;
        if (panel) {
          await sleep(800); // let the list load
          // Say what is actually in the panel right now, then what can appear and why.
          const count = document.querySelectorAll('[data-tour="alerts-panel"] .pw-notif.relative').length;
          const right = count === 0 ? "Nothing right now: you are all caught up." : `You have ${count} right now.`;
          setCard({ n: 16, ok: true, title: "What you are told, and why", body: `${right} You are told about: each open task due today, with its time ("Starts soon" in the hour before it starts); tasks missed, not ticked off by their due day; habits still left today, streaks at risk and habits missed yesterday. Tap one to open it in Tasks or Habits, or ✕ to clear it.`, target: '[data-tour="alerts-panel"]' });
          await waitOk();
          if (!alive()) return;
          if (shown('[data-tour="alerts-panel"]')) bell.click(); // close it again
          await sleep(300);
        }
      }
    } catch { /* carry on */ }
    if (!alive()) return;

    // ---- The rest of the app ----
    try {
      if (await waitFor('[data-tour="tabs"]', alive, 1500)) {
        setCard({ n: 17, ok: true, title: "Everything else", body: "Habits, Calendar and Profile are one tap away. More holds History, the theme and Tour (this guide, with pictures).", target: '[data-tour="tabs"]' });
        await waitOk();
        if (!alive()) return;
      }
    } catch { /* carry on */ }

    tourState.virtual = false;
    tourTasks.clear();
    setCard({ final: true, title: "You're all set", body: "Add your own tasks with +, and tick them off as you go. You can replay this tour from More." });
    if (stash.current !== undefined) { putDraft(stash.current); stash.current = undefined; }
  }

  // Where the card goes: under the spotlight when there is room, otherwise above it; centred when there is none.
  const width = typeof window === "undefined" ? 340 : Math.min(340, window.innerWidth - 32);
  const vh = typeof window === "undefined" ? 800 : window.innerHeight;
  const vw = typeof window === "undefined" ? 400 : window.innerWidth;
  const pad = 8;
  const style: React.CSSProperties = rect
    ? {
        width,
        left: Math.max(16, Math.min(rect.left + rect.width / 2 - width / 2, vw - width - 16)),
        ...(vh - (rect.top + rect.height) > 230 ? { top: rect.top + rect.height + pad + 12 } : { bottom: vh - rect.top + pad + 12 }),
      }
    : { width, left: (vw - width) / 2, top: "50%", transform: "translateY(-50%)" };

  return createPortal(
    <div className="fixed inset-0 z-[300]" role="dialog" aria-modal="true" aria-label="Tour">
      {/* Catches taps, so the tour is not disturbed while it plays. */}
      <div className="absolute inset-0" />
      {rect ? (
        <div className="tour-spot pointer-events-none fixed rounded-2xl"
          style={{ top: rect.top - pad, left: rect.left - pad, width: rect.width + pad * 2, height: rect.height + pad * 2 }} />
      ) : (
        <div className="fade-in pointer-events-none absolute inset-0 bg-black/50" />
      )}
      <div key={card.title} className="pw-menu glass-in fixed rounded-[18px] p-4" style={style} aria-live="polite">
        {card.n && <p className="mb-1 text-[12px] font-medium uppercase tracking-wide text-[#3478F6]">Tour · {card.n} of {STEPS}</p>}
        <h2 className="flex items-center gap-2 text-[17px] font-semibold leading-snug text-ink">
          {card.title}
          {card.tag && <span className={card.tag === "Required" ? "rounded-full bg-[#F2453D]/12 px-2 py-0.5 text-[11px] font-semibold text-[#F2453D]" : "rounded-full bg-overlay/10 px-2 py-0.5 text-[11px] font-semibold text-ink-muted"}>{card.tag}</span>}
        </h2>
        <p className="mt-1 text-[15px] leading-snug text-ink-muted">{card.body}</p>
        {/* Progress: a thin bar on its own line, so the buttons below always fit. */}
        {card.n && (
          <div className="mt-4 h-1 w-full overflow-hidden rounded-full bg-overlay/15" aria-hidden>
            <div className="h-full rounded-full bg-[#3478F6] transition-[width] duration-300" style={{ width: `${(card.n / STEPS) * 100}%` }} />
          </div>
        )}
        <div className="mt-3 flex items-center justify-end gap-2">
          <div className="flex shrink-0 items-center gap-2">
            {!card.final && <button type="button" onClick={finish} className="rounded-full px-3 py-1.5 text-[15px] text-ink-muted">Skip</button>}
            {card.intro && (
              <button type="button" onClick={() => { setCard({ n: 1, title: "Getting ready", body: "Opening your tasks…" }); void play(); }}
                className="rounded-full bg-[#3478F6] px-4 py-1.5 text-[15px] font-semibold text-white active:scale-[0.97]">Start tour</button>
            )}
            {card.ok && <button type="button" onClick={ok} autoFocus className="rounded-full bg-[#3478F6] px-5 py-1.5 text-[15px] font-semibold text-white active:scale-[0.97]">OK</button>}
            {card.final && <button type="button" onClick={finish} className="rounded-full bg-[#3478F6] px-5 py-1.5 text-[15px] font-semibold text-white active:scale-[0.97]">Done</button>}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
