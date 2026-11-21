"use client";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { todoApi } from "@/lib/todo";
import { today } from "@/lib/days";
import { PLANNER_DRAFT_KEY } from "@/components/TaskPlanner";
import { tourTasks } from "@/lib/tour";

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
    ok(); // let a waiting step end (it sees the tour has stopped)
    tourTasks.clear(); // a tour task left behind (tour skipped) is an ordinary task from now on
    if (plannerOpen.current && shown('[aria-label="Task planner"]')) window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    if (stash.current !== undefined) putDraft(stash.current);
    onClose();
  };
  // (Re)arm on mount: React's development mode mounts, unmounts and mounts again, which must not stop the tour.
  useEffect(() => { live.current = true; return () => { live.current = false; }; }, []);

  /** A step could not find its part of the app: say so instead of waiting forever. */
  const stuck = () => {
    if (!alive()) return;
    setCard({ final: true, title: "Tour stopped", body: "Something on the screen was not where the tour expected it. Close any open panel and start the tour again from More." });
    if (stash.current !== undefined) { putDraft(stash.current); stash.current = undefined; }
  };

  async function play() {
    stash.current = draftNow();
    putDraft(null); // the planner opens fresh for the tour
    goTasks();
    window.scrollTo({ top: 0, behavior: "smooth" });

    const now = today();
    // Every run adds a new task: "Try Pacewise To-do", then "… 2", "… 3" (two open tasks cannot share a title on a day).
    const titles = new Set((await todoApi.tasks().catch(() => [])).map((t) => t.title));
    let name = TOUR_TITLE;
    for (let k = 2; titles.has(name); k++) name = `${TOUR_TITLE} ${k}`;
    if (!alive()) return;

    {
      // 1. The + button
      const add = await waitFor('[data-tour="add"]', alive);
      if (!add) return stuck();
      setCard({ n: 1, ok: true, title: "Add tasks with +", body: "Every task starts here: one task or a whole plan. Tap OK and the tour opens it.", target: '[data-tour="add"]' });
      await waitOk();
      if (!alive()) return;
      add.click();
      plannerOpen.current = true;

      // 2–3. What the planner's parts do (only explained; nothing is changed)
      const explain: [string, string, string][] = [
        ['[aria-label="Task planner"] [data-tour="range"]', "Range", "The days this plan covers: this week, the next 7 days, this month, or your own dates."],
        ['[aria-label="Task planner"] [data-tour="repeat"]', "Repeat", "How often the tasks repeat in that range: every day, weekdays, once a week, every few days… Each row can also have its own repeat."],
      ];
      for (const [i, [target, heading, body]] of explain.entries()) {
        const el = await waitFor(target, alive);
        if (!el) return stuck();
        el.scrollIntoView({ block: "center", behavior: "smooth" });
        setCard({ n: 2 + i, ok: true, title: heading, body, target });
        await waitOk();
        if (!alive()) return;
      }

      // 5–12. Every column of the row, one by one: what it is, whether it is required, and the tour fills it in.
      const P = '[aria-label="Task planner"]';
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

      // Title (required)
      const title = (await cell('[data-cell="0-0"]')) as HTMLInputElement | null;
      if (!title) return stuck();
      if (!(await step(4, '[data-cell="0-0"]', "Title", "Required", "What needs doing. The only thing a task must have. Things you add are suggested again next time. Tap OK and the tour types one."))) return;
      await typeInto(title, name);
      title.focus(); title.blur(); // closes the suggestion list
      await sleep(500);

      // Notes (optional)
      const notes = (await cell('[data-cell="0-1"]')) as HTMLInputElement | null;
      if (!notes) return stuck();
      if (!(await step(5, '[data-cell="0-1"]', "Notes", "Optional", "Details, links or steps for the task. Tap OK and the tour adds a short note."))) return;
      await typeInto(notes, "Added by the tour");
      await sleep(400);

      // Priority (optional)
      const prio = await cell('[data-cell="0-2"]');
      if (!prio) return stuck();
      if (!(await step(6, '[data-cell="0-2"]', "Priority", "Optional", "Low, Medium or High. It is Medium unless you change it. Tap OK and the tour sets High."))) return;
      prio.click();
      const high = await waitFor('[role="listbox"] [role="option"]', alive, 2000);
      const pick = [...document.querySelectorAll<HTMLElement>('[role="listbox"] [role="option"]')].find((o) => o.textContent?.trim() === "High");
      if (high && pick) pick.click(); else window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
      await sleep(400);

      // Date (optional)
      const date = (await cell('[data-cell="0-3"]')) as HTMLInputElement | null;
      if (!date) return stuck();
      if (!(await step(7, '[data-cell="0-3"]', "Date", "Optional", "A date adds the task on that day only. Left empty, it repeats on the plan's days (Range and Repeat). Tap OK to set today, so this adds exactly one task."))) return;
      setValue(date, now);
      await sleep(500);

      // All day (optional)
      const allDay = (await cell('input[aria-label="Row 1 all day"]')) as HTMLInputElement | null;
      if (!allDay) return stuck();
      if (!(await step(8, 'input[aria-label="Row 1 all day"] + span', "All day", "Optional", "Ticked, the task has no set time. Untick it to give it a time slot. Tap OK and the tour unticks it."))) return;
      if (allDay.checked) allDay.click();
      await sleep(500);

      // From and To (optional): 9–10 AM, or the next free hour today when 10 AM has passed
      const d = new Date();
      const late = d.getHours() >= 10;
      const startH = late ? Math.min(d.getHours() + 1, 22) : 9;
      const from = `${String(startH).padStart(2, "0")}:00`;
      const to = `${String(startH + 1).padStart(2, "0")}:00`;
      const fmt = (t: string) => { const h = Number(t.slice(0, 2)); return `${h % 12 === 0 ? 12 : h % 12}:00 ${h < 12 ? "AM" : "PM"}`; };
      const setTime = async (el: HTMLInputElement, t: string) => { el.focus(); await sleep(30); setValue(el, fmt(t)); await sleep(60); el.blur(); await sleep(300); };
      const fromEl = (await cell('[data-cell="0-4"]')) as HTMLInputElement | null;
      if (!fromEl) return stuck();
      if (!(await step(9, '[data-cell="0-4"]', "From", "Optional", late
        ? `When it starts. 9 AM has already passed today, so the tour uses ${fmt(from)}. Tap OK to set it (or use the clock button).`
        : "When it starts. Tap OK and the tour sets 9:00 AM (you can also use the clock button)."))) return;
      await setTime(fromEl, from);
      const toEl = (await cell('[data-cell="0-5"]')) as HTMLInputElement | null;
      if (!toEl) return stuck();
      if (!(await step(10, '[data-cell="0-5"]', "To", "Optional", `When it ends. Tap OK and the tour sets ${fmt(to)}, so the task lasts one hour.`))) return;
      await setTime(toEl, to);

      // Repeat (optional)
      if (!(await cell('[data-cell="0-6"]'))) return stuck();
      if (!(await step(11, '[data-cell="0-6"]', "Repeat", "Optional", "How often this row repeats in the plan. With a Date it is Once, as here. Without one it follows the plan's Repeat, or its own."))) return;

      // Preview: the calendar at the bottom shows the day(s) the task will be set on
      const preview = await waitFor(`${P} [data-tour="preview"]`, alive);
      if (!preview) return stuck();
      preview.scrollIntoView({ block: "center", behavior: "smooth" });
      await sleep(400);
      setCard({ n: 12, ok: true, title: "Preview", body: "Everything filled in. This calendar shows the day your task will be set on: the filled-in date is today. With a repeat, every planned day would be filled in here.", target: `${P} [data-tour="preview"]` });
      await waitOk();
      if (!alive()) return;

      // 4. Add
      const submit = await waitFor('[data-tour="planner-add"]', alive);
      if (!submit) return stuck();
      submit.scrollIntoView({ block: "nearest", behavior: "smooth" });
      setCard({ n: 13, ok: true, title: "Add it", body: "This adds it to your list and to your Pacewise calendar. Tap OK to add it.", target: '[data-tour="planner-add"]' });
      await waitOk();
      if (!alive()) return;
      // Never add more than the one task this tour promises.
      if (!/\bAdd 1 task\b/.test(submit.textContent ?? "") || (submit as HTMLButtonElement).disabled) {
        setCard({ final: true, title: "Tour stopped", body: "The planner is open with the tour's task filled in. Check it, then tap Add yourself, or close it." });
        plannerOpen.current = false;
        if (stash.current !== undefined) { putDraft(stash.current); stash.current = undefined; }
        return;
      }
      tourTasks.add(name); // ticking this one off later deletes it (a practice task)
      submit.click();
      plannerOpen.current = false;
    }

    // 5. The new task in the list
    const sel = `[data-task-title="${name}"]`;
    const task = await waitFor(sel, alive, 8000);
    if (!alive()) return;
    if (task) {
      task.scrollIntoView({ block: "center", behavior: "smooth" });
      setCard({ n: 14, ok: true, title: "Your new task", body: "Tick the box when it is done. Missed one? You can still tick it off the next day.", target: sel });
      await waitOk();
      if (!alive()) return;

      // 9. Tick it off: the practice task is then deleted for good, so the list stays clean
      setCard({ n: 15, ok: true, title: "Tick it off", body: "Tap OK and the tour ticks it. Because this was a practice task, it is then removed for good, not kept under Done. Your own tasks go to Done.", target: sel });
      await waitOk();
      if (!alive()) return;
      const box = shown(`${sel} button[aria-label="Mark as done"]`);
      if (box) {
        box.click();
        for (let t = 0; t < 5000 && alive() && shown(sel); t += 100) await sleep(100); // wait for it to slide away
        if (!alive()) return;
      }
    }

    // 16. Notifications (after the practice task was added and removed): open the bell and show what is there, and why
    const bell = await waitFor('[data-tour="alerts"]', alive, 1500);
    if (bell) {
      window.scrollTo({ top: 0, behavior: "smooth" });
      await sleep(400);
      setCard({ n: 16, ok: true, title: "Notifications", body: "Notifications tell you about your tasks of the day, so nothing planned for today slips by. The red number shows how many are new. Tap OK and the tour opens it.", target: '[data-tour="alerts"]' });
      await waitOk();
      if (!alive()) return;
      bell.click();
      const panel = await waitFor('[data-tour="alerts-panel"]', alive, 3000);
      if (!alive()) return;
      if (panel) {
        await sleep(500); // let the list load
        setCard({ n: 16, ok: true, title: "What you are told, and why", body: "This is your day at a glance: each task due today with its time, and \"Starts soon\" just before one begins. Missed tasks: not done by their day. Habits still left today, and streaks to keep. Tap one to jump to it, or ✕ to clear it.", target: '[data-tour="alerts-panel"]' });
        await waitOk();
        if (!alive()) return;
        if (shown('[data-tour="alerts-panel"]')) bell.click(); // close it again
        await sleep(300);
      }
    }

    // 6. The rest of the app
    if (await waitFor('[data-tour="tabs"]', alive, 1500)) {
      setCard({ n: 17, ok: true, title: "Everything else", body: "Habits, Calendar and Profile are one tap away. More holds History, the theme and this tour.", target: '[data-tour="tabs"]' });
      await waitOk();
      if (!alive()) return;
    }

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
      <div key={card.title} className="ios-menu glass-in fixed rounded-[18px] p-4" style={style} aria-live="polite">
        {card.n && <p className="mb-1 text-[12px] font-medium uppercase tracking-wide text-[#007AFF]">Tour · {card.n} of {STEPS}</p>}
        <h2 className="flex items-center gap-2 text-[17px] font-semibold leading-snug text-ink">
          {card.title}
          {card.tag && <span className={card.tag === "Required" ? "rounded-full bg-[#FF3B30]/12 px-2 py-0.5 text-[11px] font-semibold text-[#FF3B30]" : "rounded-full bg-overlay/10 px-2 py-0.5 text-[11px] font-semibold text-ink-muted"}>{card.tag}</span>}
        </h2>
        <p className="mt-1 text-[15px] leading-snug text-ink-muted">{card.body}</p>
        {/* Progress: a thin bar on its own line, so the buttons below always fit. */}
        {card.n && (
          <div className="mt-4 h-1 w-full overflow-hidden rounded-full bg-overlay/15" aria-hidden>
            <div className="h-full rounded-full bg-[#007AFF] transition-[width] duration-300" style={{ width: `${(card.n / STEPS) * 100}%` }} />
          </div>
        )}
        <div className="mt-3 flex items-center justify-end gap-2">
          <div className="flex shrink-0 items-center gap-2">
            {!card.final && <button type="button" onClick={finish} className="rounded-full px-3 py-1.5 text-[15px] text-ink-muted">Skip</button>}
            {card.intro && (
              <button type="button" onClick={() => { setCard({ n: 1, title: "Getting ready", body: "Opening your tasks…" }); void play(); }}
                className="rounded-full bg-[#007AFF] px-4 py-1.5 text-[15px] font-semibold text-white active:scale-[0.97]">Start tour</button>
            )}
            {card.ok && <button type="button" onClick={ok} autoFocus className="rounded-full bg-[#007AFF] px-5 py-1.5 text-[15px] font-semibold text-white active:scale-[0.97]">OK</button>}
            {card.final && <button type="button" onClick={finish} className="rounded-full bg-[#007AFF] px-5 py-1.5 text-[15px] font-semibold text-white active:scale-[0.97]">Done</button>}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
