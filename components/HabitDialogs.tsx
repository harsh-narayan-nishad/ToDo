"use client";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Archive, ArchiveRestore, Check, ChevronsUpDown, Clock, Flame, Pencil, Plus, Trash2, X } from "lucide-react";
import LiquidGlass from "@/components/LiquidGlass";
import { GlassButton } from "@/components/GlassButton";
import { DropdownMenu, YearSelect } from "@/components/GlassDropdown";
import { ButtonWheel } from "@/components/WheelSpinner";
import { AnalogClock, ClockPopup } from "@/components/TaskDialogs";
import { Marked } from "@/components/TaskSheet";
import { FIELD, LABEL } from "@/components/ui";
import { addDays, clock, dayLabel, longDay, today } from "@/lib/days";
import {
  ALL_DAYS, CATEGORIES, KINDS, SCALES, TEMPLATES, WEEK,
  bestStreak, categoryLabel, currentStreak, daysLabel, goalLabel, isDone, isPlanned, kindLabel, minutesLabel, progress, scaleLabel, sleepMinutes, successRate,
  type Habit, type HabitCategory, type HabitEntry, type HabitInput, type HabitKind, type HabitScale,
} from "@/lib/habits";
import { cn } from "@/lib/utils";

/** A panel of liquid glass over a blurred page, like New task. Escape or a click outside closes it. */
export function GlassSheet({ label, onClose, children, wide }: { label: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onClose]);
  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-end justify-center bg-canvas/70 p-3 backdrop-blur-[48px] backdrop-saturate-150 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label={label}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={cn("glass-in relative w-full", wide ? "max-w-2xl" : "max-w-lg")}>
        <span className="absolute inset-0" aria-hidden><LiquidGlass width="100%" height="100%" radius={28} blur={4} /></span>
        <div className="relative flex max-h-[85dvh] flex-col gap-5 overflow-y-auto p-6 sm:p-8">
          <div className="flex items-start justify-between gap-3">
            <h2 className="min-w-0 break-words font-display text-2xl">{label}</h2>
            <button type="button" onClick={onClose} aria-label="Close" className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-ink-muted"><X className="h-5 w-5" /></button>
          </div>
          {children}
        </div>
      </div>
    </div>,
    document.body,
  );
}

/** A row of square options in the To-do style; the chosen one is ink. */
export function Segmented<T extends string>({ value, options, onChange, disabled, label, soft = false }: {
  value: T; options: { id: T; label: string; hint?: string }[]; onChange: (v: T) => void; disabled?: boolean; label: string;
  /** Segmented control: a grey rounded track with the chosen option on a white pill. */
  soft?: boolean;
}) {
  if (soft) return (
    <div role="radiogroup" aria-label={label} className="pw-seg flex w-full rounded-[10px] p-[3px]">
      {options.map((o) => (
        <button key={o.id} type="button" role="radio" aria-checked={value === o.id} disabled={disabled && value !== o.id} title={o.hint} onClick={() => onChange(o.id)}
          className={cn("flex-1 whitespace-nowrap rounded-[8px] px-2 py-1.5 text-[14px] font-medium transition-colors disabled:opacity-40", value === o.id ? "pw-seg-on text-ink" : "text-ink-muted")}>
          {o.label}
        </button>
      ))}
    </div>
  );
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-1">
      {options.map((o) => (
        <button key={o.id} type="button" role="radio" aria-checked={value === o.id} disabled={disabled && value !== o.id} title={o.hint} onClick={() => onChange(o.id)}
          className={cn("whitespace-nowrap rounded-none border px-3.5 py-1.5 text-sm transition-colors disabled:opacity-40",
            value === o.id ? "border-ink bg-ink text-canvas" : "border-overlay/15 text-ink-muted")}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

const defaults = (kind: HabitKind) => (kind === "count" ? 8 : kind === "duration" ? 20 : kind === "sleep" ? 480 : 1);

/** New habit or edit one: name (with ready-made ideas), type, size, goal, days, category and cue. The type is fixed once added. */
export function HabitEditor({ habit, preset, habits, onClose, onSave }: {
  habit?: Habit; preset?: Partial<HabitInput>; habits: Habit[]; onClose: () => void; onSave: (input: HabitInput) => Promise<void>;
}) {
  const start = habit ?? preset;
  const [name, setName] = useState(start?.name ?? "");
  const [kind, setKind] = useState<HabitKind>(start?.kind ?? "check");
  const [scale, setScale] = useState<HabitScale>(start?.scale ?? "daily");
  const [category, setCategory] = useState<HabitCategory>(start?.category ?? "other");
  const [target, setTarget] = useState(String(start?.target && start.kind === kind ? (kind === "sleep" ? start.target / 60 : start.target) : kind === "sleep" ? 8 : defaults(kind)));
  const [unit, setUnit] = useState(start?.unit ?? "");
  const [days, setDays] = useState<number[]>(start?.days ?? ALL_DAYS);
  const [cue, setCue] = useState(start?.cue ?? "");
  /** At what time (optional): picked on the same clock as a task's time. */
  const [time, setTime] = useState<string | null>(start?.time ?? null);
  const [timeOpen, setTimeOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  useEffect(() => { nameRef.current?.focus(); }, []);

  const hasSleep = habits.some((h) => h.kind === "sleep" && !h.archived && h.id !== habit?.id);
  const taken = new Set(habits.filter((h) => !h.archived && h.id !== habit?.id).map((h) => h.name.trim().toLowerCase()));
  const duplicate = name.trim() && taken.has(name.trim().toLowerCase());
  /** Ideas for this size of habit that are not tracked yet, matching what is typed. */
  const ideas = useMemo(() => {
    if (habit) return [];
    const q = name.trim().toLowerCase();
    return TEMPLATES.filter((t) => t.scale === scale && !taken.has(t.name.toLowerCase()) && t.kind !== "sleep" && (!q || t.name.toLowerCase().includes(q)) && t.name.toLowerCase() !== q).slice(0, 8);
  }, [name, scale, habit]); // eslint-disable-line react-hooks/exhaustive-deps

  function pickKind(k: HabitKind) {
    setKind(k);
    setTarget(String(k === "sleep" ? 8 : defaults(k)));
    if (k === "sleep") { setCategory("sleep"); if (!name.trim()) setName("Sleep"); }
  }
  function applyIdea(t: HabitInput) {
    setName(t.name); setKind(t.kind); setScale(t.scale); setCategory(t.category); setUnit(t.unit); setDays(t.days); setCue(t.cue);
    setTarget(String(t.kind === "sleep" ? t.target / 60 : t.target));
    setError(null);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (!/[\p{L}\p{N}]/u.test(name)) { setError("Give the habit a name."); return; }
    if (duplicate) { setError("You already have a habit with this name."); return; }
    if (!habit && kind === "sleep" && hasSleep) { setError("You already track your sleep."); return; }
    const n = Number(target);
    let t = 1;
    if (kind === "count") { if (!Number.isInteger(n) || n < 1 || n > 100000) { setError("The goal is a whole number from 1 to 100,000."); return; } t = n; }
    if (kind === "duration") { if (!Number.isInteger(n) || n < 1 || n > 1440) { setError("The goal is 1 to 1440 minutes."); return; } t = n; }
    if (kind === "sleep") { if (!(n >= 1 && n <= 16)) { setError("The sleep goal is 1 to 16 hours."); return; } t = Math.round(n * 60); }
    setBusy(true);
    setError(null);
    try {
      await onSave({ name: name.trim(), kind, scale, category: kind === "sleep" ? "sleep" : category, target: t, unit: kind === "count" ? unit.trim() : "", days, cue: cue.trim(), time: kind === "sleep" ? null : time });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the habit.");
      setBusy(false);
    }
  }

  const catRef = useRef<HTMLButtonElement>(null);
  const [catOpen, setCatOpen] = useState(false);
  const goalUnit = kind === "sleep" ? "hours" : kind === "duration" ? "min" : "";
  const quickDays: { id: string; label: string; days: number[] }[] = [
    { id: "Every day", label: "Every day", days: ALL_DAYS }, { id: "Weekdays", label: "Weekdays", days: [0, 1, 2, 3, 4] }, { id: "Weekends", label: "Weekends", days: [5, 6] },
  ];

  return (
    <SettingsSheet label={habit ? "Edit habit" : "New habit"} onClose={onClose}>
      <form onSubmit={(e) => void submit(e)} className="flex flex-col">
        <Section title="Size" note={SCALES.find((s) => s.id === scale)?.hint}>
          <Segmented soft label="Size" value={scale} options={SCALES} onChange={setScale} />
        </Section>

        <Section title="Name" note={duplicate ? <span className="text-accent-fast">You already track a habit with this name.</span> : undefined}>
          <NameField inputRef={nameRef} value={name} onChange={setName} ideas={ideas} onPick={applyIdea} label={`${scaleLabel(scale)} ideas`} />
        </Section>

        <Section title="Type" note={habit ? "The type can't be changed once added." : KINDS.find((k) => k.id === kind)?.hint}>
          <Segmented soft label="Type" value={kind} options={KINDS.filter((k) => k.id !== "sleep" || kind === "sleep")} onChange={pickKind} disabled={!!habit} />
        </Section>

        {(kind === "count" || kind === "duration" || kind === "sleep") && (
          <Section title="Goal">
            <div className="pw-group overflow-hidden rounded-[14px]">
              <label className={cn(ROW, kind === "count" && ROW_LINE)}>
                <span className="shrink-0 text-[17px] text-ink">{kind === "sleep" ? "Hours a night" : kind === "duration" ? "Minutes a day" : "A day"}</span>
                <input type="number" inputMode="decimal" min={1} step={kind === "sleep" ? 0.5 : 1} value={target} onChange={(e) => setTarget(e.target.value)} className={cn(ROW_INPUT, "text-right tabular-nums")} />
                {goalUnit && <span className="shrink-0 text-[17px] text-ink-muted">{goalUnit}</span>}
              </label>
              {kind === "count" && (
                <label className={ROW}>
                  <span className="shrink-0 text-[17px] text-ink">Unit</span>
                  <input value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="glasses, steps, pages…" maxLength={20} className={cn(ROW_INPUT, "text-right")} />
                </label>
              )}
            </div>
          </Section>
        )}

        <Section title="Schedule">
          <div className="pw-group overflow-hidden rounded-[14px]">
            <div className={cn("flex flex-col gap-3 px-4 py-3.5", ROW_LINE)}>
              <div className="flex justify-between gap-1" role="group" aria-label="Days">
                {WEEK.map((w, d) => (
                  <button key={w} type="button" onClick={() => { const next = days.includes(d) ? days.filter((x) => x !== d) : [...days, d].sort(); if (next.length) setDays(next); }} aria-pressed={days.includes(d)} aria-label={w}
                    className={cn("grid h-10 w-10 place-items-center rounded-full text-[13px] font-semibold transition-colors active:scale-95",
                      days.includes(d) ? "bg-[#3478F6] text-white" : "bg-overlay/[0.08] text-ink-muted")}>
                    {w.slice(0, 2)}
                  </button>
                ))}
              </div>
              <Segmented soft label="Quick pick" value={daysLabel(days)} options={quickDays} onChange={(id) => setDays(quickDays.find((q) => q.id === id)!.days)} />
            </div>
            {kind !== "sleep" && (
              <div className={cn(ROW, ROW_LINE)}>
                <button type="button" onClick={() => setTimeOpen(true)} aria-label={time ? `Time: ${clock(time)}. Change` : "Pick a time"} className="flex min-h-[46px] flex-1 items-center gap-3 text-left">
                  <span className="flex-1 text-[17px] text-ink">Time</span>
                  <span className={cn("text-[17px] tabular-nums", time ? "text-[#3478F6]" : "text-ink-muted")}>{time ? clock(time) : "Any time"}</span>
                  {!time && <Clock className="h-[18px] w-[18px] text-ink-faint" aria-hidden />}
                </button>
                {time && <button type="button" onClick={() => setTime(null)} aria-label="Clear the time" className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-overlay/[0.12] text-ink-muted"><X className="h-3.5 w-3.5" strokeWidth={2.5} /></button>}
              </div>
            )}
            {kind !== "sleep" && (
              <button ref={catRef} type="button" onClick={() => setCatOpen((o) => !o)} aria-haspopup="listbox" aria-expanded={catOpen} aria-label={`Category: ${categoryLabel(category)}`}
                className={cn(ROW, "w-full text-left transition-colors active:bg-overlay/[0.06]")}>
                <span className="flex-1 text-[17px] text-ink">Category</span>
                <span className="text-[17px] text-ink-muted">{categoryLabel(category)}</span>
                <ChevronsUpDown className="h-4 w-4 shrink-0 text-ink-faint" aria-hidden />
              </button>
            )}
          </div>
          {catOpen && (
            <DropdownMenu soft anchor={catRef} label="Category" value={category} minWidth={220} onSelect={(id) => setCategory(id as HabitCategory)} onClose={() => setCatOpen(false)}
              groups={[{ title: "", items: CATEGORIES.filter((c) => c.id !== "sleep").map((c) => ({ id: c.id, label: c.label })) }]} />
          )}
          {timeOpen && (
            <ClockPopup title="Time" onClose={() => setTimeOpen(false)}>
              <AnalogClock label="Time" value={time ?? "07:00"} onChange={setTime} />
            </ClockPopup>
          )}
        </Section>

        <Section title="Cue or reason" note="Optional. A cue makes a habit easier to keep.">
          <div className="pw-group rounded-[14px] px-4">
            <input value={cue} onChange={(e) => setCue(e.target.value)} placeholder="After I…, so that I…" maxLength={200} aria-label="Cue or reason" className={cn(ROW_INPUT, "min-h-[46px] py-2.5")} />
          </div>
        </Section>

        {error && <p className="-mt-3 mb-5 px-4 text-[15px] text-accent-extreme" role="alert">{error}</p>}
        <div className="flex gap-3">
          <button type="button" onClick={onClose} disabled={busy}
            className="h-12 flex-1 rounded-full bg-overlay/[0.08] text-[17px] font-medium text-ink transition-transform active:scale-[0.98] disabled:opacity-40">Cancel</button>
          <button type="submit" disabled={busy || !name.trim()}
            className="inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-full bg-[#3478F6] text-[17px] font-semibold text-white transition-transform active:scale-[0.98] disabled:opacity-40">
            {busy ? <ButtonWheel /> : habit ? <Check className="h-[18px] w-[18px]" strokeWidth={2.5} /> : <Plus className="h-[18px] w-[18px]" strokeWidth={2.5} />}{busy ? "Saving…" : habit ? "Save" : "Add habit"}
          </button>
        </div>
      </form>
    </SettingsSheet>
  );
}

/** Settings-style rows for the habit editor: a row inside a rounded group, its divider, and a borderless input. */
export const ROW = "flex min-h-[46px] items-center gap-3 px-4";
export const ROW_LINE = "border-b border-overlay/10";
export const ROW_INPUT = "w-full min-w-0 flex-1 bg-transparent text-[17px] text-ink outline-none placeholder:text-ink-faint";

/**
 * The habit's name, with ready-made ideas in the app's standard suggestion list (as under a task's Title cell):
 * a list floating below the field while it has focus, the typed words highlighted, ↑ ↓ to move, Enter to pick, Esc to hide.
 */
function NameField({ inputRef, value, onChange, ideas, onPick, label }: {
  inputRef: React.RefObject<HTMLInputElement>; value: string; onChange: (v: string) => void; ideas: HabitInput[]; onPick: (t: HabitInput) => void; label: string;
}) {
  const box = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [pos, setPos] = useState<{ left: number; width: number; top?: number; bottom?: number } | null>(null);
  const show = open && ideas.length > 0;
  useEffect(() => setActive(-1), [value]);

  const place = () => {
    const r = box.current?.getBoundingClientRect();
    if (!r) return;
    const width = Math.min(r.width, window.innerWidth - 24);
    const left = Math.max(12, Math.min(r.left, window.innerWidth - width - 12));
    setPos(window.innerHeight - r.bottom < 300 && r.top > window.innerHeight - r.bottom ? { left, width, bottom: window.innerHeight - r.top + 4 } : { left, width, top: r.bottom + 4 });
  };
  useLayoutEffect(() => { if (show) place(); }, [show]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!show) return;
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => { window.removeEventListener("resize", place); window.removeEventListener("scroll", place, true); };
  }); // eslint-disable-line react-hooks/exhaustive-deps

  const pick = (t: HabitInput) => { onPick(t); setOpen(false); inputRef.current?.focus(); };
  const detail = (t: HabitInput) => [goalLabel({ ...t, id: "", startDay: "", archived: false, createdAt: "" }) || kindLabel(t.kind), categoryLabel(t.category)].join(" · ");

  return (
    <div ref={box} className="pw-group rounded-[14px] px-4">
      <input ref={inputRef} value={value} placeholder="e.g. Read, Drink water, No sugar" maxLength={80} autoComplete="off"
        role="combobox" aria-expanded={show} aria-autocomplete="list" aria-label="Name"
        onChange={(e) => { onChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onClick={() => setOpen(true)}
        onBlur={(e) => { if (!list.current?.contains(e.relatedTarget as Node)) setOpen(false); }}
        onKeyDown={(e) => {
          if (!show) return;
          if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(ideas.length - 1, a + 1)); }
          else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(-1, a - 1)); }
          else if (e.key === "Enter" && active >= 0) { e.preventDefault(); pick(ideas[active]); }
          else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); setOpen(false); }
        }}
        className={cn(ROW_INPUT, "min-h-[46px] py-2.5")} />
      {show && pos && createPortal(
        <ul ref={list} role="listbox" aria-label={label}
          className="pw-menu glass-in fixed z-[160] max-h-72 overflow-y-auto rounded-[14px]"
          style={{ left: pos.left, width: pos.width, top: pos.top, bottom: pos.bottom }}>
          {ideas.map((t, i) => (
            <li key={t.name} role="option" aria-selected={i === active}>
              <button type="button" tabIndex={-1} onMouseDown={(e) => e.preventDefault()} onClick={() => pick(t)} onMouseEnter={() => setActive(i)} title={t.cue || t.name}
                className={cn("block w-full pl-4 text-left transition-colors active:bg-overlay/[0.08]", i === active && "bg-overlay/[0.06]")}>
                <span className={cn("block min-w-0 py-[11px] pr-4", i < ideas.length - 1 && "border-b border-overlay/10")}>
                  <span className="block truncate text-[17px] leading-snug text-ink"><Marked text={t.name} q={value} /></span>
                  <span className="mt-0.5 block truncate text-[13px] text-ink-muted">{detail(t)}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>,
        document.body,
      )}
    </div>
  );
}

/** A titled block of the settings-style editor: small caps heading, the content, and a quiet footnote. */
export function Section({ title, note, children }: { title: string; note?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="mb-7">
      <p className="mb-1.5 px-4 text-[13px] uppercase tracking-wide text-ink-muted">{title}</p>
      {children}
      {note && <p className="mt-1.5 px-4 text-[13px] text-ink-muted">{note}</p>}
    </div>
  );
}

/** The habit editor's sheet, built like the Menu: a grey grouped page with white rounded groups over a dimmed screen. */
/**
 * Freezes the page's own scrolling while a sheet is open (and gives it back, where it was, when the last one closes).
 * iPhones ignore overflow: hidden on the page, so the page is pinned in place with position: fixed instead.
 */
let locks = 0;
let saved: { y: number; html: string; body: string; pos: string; top: string; width: string } | null = null;
function lockPageScroll(): () => void {
  if (locks++ === 0) {
    const b = document.body, h = document.documentElement;
    saved = { y: window.scrollY, html: h.style.overflow, body: b.style.overflow, pos: b.style.position, top: b.style.top, width: b.style.width };
    h.style.overflow = "hidden"; b.style.overflow = "hidden";
    b.style.position = "fixed"; b.style.top = `-${saved.y}px`; b.style.width = "100%";
  }
  return () => {
    if (--locks > 0 || !saved) return;
    const b = document.body, h = document.documentElement, s = saved;
    h.style.overflow = s.html; b.style.overflow = s.body; b.style.position = s.pos; b.style.top = s.top; b.style.width = s.width;
    window.scrollTo(0, s.y);
    saved = null;
  };
}

export function SettingsSheet({ label, onClose, children, wide = false, compact = false }: { label: string; onClose: () => void; children: React.ReactNode; /** Wider on large screens (Overview). */ wide?: boolean; /** Opens at a report's usual height (as the goal report), the rest scrolling inside, however long it is. */ compact?: boolean }) {
  const self = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // Only the sheet on top closes (a New goal sheet over the Goals sheet closes alone).
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape" && [...document.querySelectorAll('[role="dialog"]')].at(-1) === self.current) onClose(); };
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onClose]);
  // While a sheet is open the page behind stays still: scrolling, on the sheet or around it, never moves the page.
  useEffect(() => lockPageScroll(), []);
  return createPortal(
    <div ref={self} className="pw-menu-backdrop fade-in fixed inset-0 z-[100] flex touch-none items-end justify-center overscroll-none sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label={label}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={cn("pw-grouped-bg glass-in flex w-full flex-col", compact ? "max-h-[min(78dvh,680px)]" : "max-h-[92dvh] sm:max-h-[88dvh]", wide ? "max-w-2xl" : "max-w-lg", "overflow-hidden rounded-t-[20px] bg-canvas shadow-themed sm:rounded-[20px]")}>
        <div className="flex items-center justify-between gap-4 px-5 pb-2 pt-5">
          <h2 className="min-w-0 truncate text-[28px] font-semibold leading-tight tracking-[-0.02em] text-ink">{label}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-overlay/[0.08] text-ink-muted transition-transform active:scale-95"><X className="h-4 w-4" /></button>
        </div>
        <div className="flex-1 touch-pan-y overflow-y-auto overscroll-contain px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-3">{children}</div>
      </div>
    </div>,
    document.body,
  );
}

const QUALITY = ["Poor", "Restless", "Okay", "Good", "Great"];

/** Log last night's sleep (today's entry): bed and wake time on the clock, and how well you slept. */
export function SleepDialog({ habit, entry, onClose, onSave }: {
  habit: Habit; entry?: HabitEntry | null; onClose: () => void; onSave: (body: { bedTime: string; wakeTime: string; quality: number | null; note: string }) => Promise<void>;
}) {
  const [bed, setBed] = useState(entry?.bedTime ?? "23:00");
  const [wake, setWake] = useState(entry?.wakeTime ?? "07:00");
  const [quality, setQuality] = useState<number | null>(entry?.quality ?? null);
  const [note, setNote] = useState(entry?.note ?? "");
  const [open, setOpen] = useState<"bed" | "wake" | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const slept = sleepMinutes(bed, wake);
  const bad = slept < 30 ? "That is less than 30 minutes of sleep." : slept > 960 ? "That is more than 16 hours of sleep." : null;

  async function save() {
    if (bad || busy) return;
    setBusy(true);
    setError(null);
    try { await onSave({ bedTime: bed, wakeTime: wake, quality, note: note.trim() }); onClose(); } catch (e) { setError(e instanceof Error ? e.message : "Could not save."); setBusy(false); }
  }
  const field = (which: "bed" | "wake", label: string, value: string) => (
    <div className={LABEL}>
      <span>{label}</span>
      <button type="button" onClick={() => setOpen(which)} className={cn(FIELD, "text-left tabular-nums")}>{clock(value)}</button>
    </div>
  );

  return (
    <GlassSheet label={entry ? "Edit last night" : "Log last night"} onClose={onClose}>
      <div className="grid grid-cols-2 gap-5">
        {field("bed", "Went to bed", bed)}
        {field("wake", "Woke up", wake)}
      </div>
      <p className="-mt-1 text-sm text-ink-muted">
        <span className="font-display text-2xl text-ink">{minutesLabel(slept)}</span>
        <span className="ml-2">of {minutesLabel(habit.target)} goal</span>
      </p>
      <div className="flex flex-col gap-2">
        <span className={LABEL}>How well did you sleep?</span>
        <div className="flex flex-wrap gap-1">
          {QUALITY.map((q, i) => (
            <button key={q} type="button" onClick={() => setQuality(quality === i + 1 ? null : i + 1)} aria-pressed={quality === i + 1}
              className={cn("rounded-none border px-3 py-1.5 text-sm transition-colors", quality === i + 1 ? "border-ink bg-ink text-canvas" : "border-overlay/15 text-ink-muted")}>{q}</button>
          ))}
        </div>
      </div>
      <label className={LABEL}>Note (optional)
        <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} placeholder="Late coffee, woke up at 3, …" className={FIELD} />
      </label>
      {(bad || error) && <p className="text-sm text-accent-extreme" role="alert">{bad ?? error}</p>}
      <div className="flex justify-end gap-2">
        <GlassButton type="button" onClick={onClose} disabled={busy}>Cancel</GlassButton>
        <GlassButton type="button" strong onClick={() => void save()} disabled={busy || !!bad}>{busy ? <ButtonWheel /> : <Check className="h-4 w-4" />}{busy ? "Saving…" : "Save"}</GlassButton>
      </div>
      {open === "bed" && <ClockPopup title="Went to bed" onClose={() => setOpen(null)}><AnalogClock label="Went to bed" value={bed} onChange={setBed} /></ClockPopup>}
      {open === "wake" && <ClockPopup title="Woke up" onClose={() => setOpen(null)}><AnalogClock label="Woke up" value={wake} onChange={setWake} /></ClockPopup>}
    </GlassSheet>
  );
}

export const levelOf = (share: number) => (share <= 0 ? 0 : share < 0.34 ? 1 : share < 0.67 ? 2 : share < 1 ? 3 : 4);

/** A neutral GitHub-style grid, one column per week (Monday on top). `cells` run oldest → newest. */
/**
 * One calendar year as a heatmap, drawn like the Profile's Consistency map: rounded cells, month names on top, a
 * green scale, today outlined, and opened scrolled to the current week (an earlier year opens at January).
 */
const GRID_CELL = 11;
const GRID_GAP = 3;
const GRID_GREEN = ["bg-overlay/10", "bg-accent-medium/30", "bg-accent-medium/55", "bg-accent-medium/80", "bg-accent-medium"];
const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const HOVER_CARD = "rounded-2xl border border-overlay/10 bg-canvas-raised px-3.5 py-2.5 text-[13px] leading-snug text-ink shadow-themed";

/** One habit on one day, for a grid's day card: "✓ Read · 20 min", "✗ Walk · missed", "– Floss · skipped". */
export function habitDayLine(h: Habit, e: HabitEntry | null | undefined, day: string, now: string): string {
  const amount = e && !e.skipped ? (h.kind === "count" ? `${e.value.toLocaleString()}${h.unit ? ` ${h.unit}` : ""} of ${h.target.toLocaleString()}` : h.kind === "duration" || h.kind === "sleep" ? `${minutesLabel(e.value)} of ${minutesLabel(h.target)}` : h.kind === "quit" ? "avoided" : "done") : "";
  if (e?.skipped) return `– ${h.name} · skipped`;
  if (isDone(h, e)) return `✓ ${h.name} · ${amount}`;
  if (e) return `◐ ${h.name} · ${amount}`;
  return `✗ ${h.name} · ${day === now ? "not yet" : "missed"}`;
}

export function HabitGrid({ cells }: { cells: { day: string; level: number; title: string; off?: boolean; /** The day's habits, one line each, in the day card. */ lines?: string[] }[] }) {
  const scroller = useRef<HTMLDivElement>(null);
  /** The day card: shown on hover, and kept open by a click / tap (click again or anywhere else to close). */
  const [card, setCard] = useState<{ i: number; x: number; y: number; pinned: boolean } | null>(null);
  useEffect(() => {
    if (!card?.pinned) return;
    const close = (e: Event) => { if (!(e.target instanceof Element && e.target.closest("[data-habit-cell]"))) setCard(null); };
    const hide = () => setCard(null);
    document.addEventListener("pointerdown", close, true);
    window.addEventListener("scroll", hide, true);
    return () => { document.removeEventListener("pointerdown", close, true); window.removeEventListener("scroll", hide, true); };
  }, [card?.pinned]);
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const t = el.querySelector<HTMLElement>("[data-today]");
    el.scrollLeft = t ? Math.max(0, el.scrollLeft + t.getBoundingClientRect().left - el.getBoundingClientRect().left - el.clientWidth + 48) : 0;
  }, [cells.length, cells[0]?.day]);
  if (!cells.length) return null;
  const now = today();
  const [y, m, d] = cells[0].day.split("-").map(Number);
  const lead = (new Date(y, m - 1, d).getDay() + 6) % 7;
  const all = [...Array<null>(lead).fill(null), ...cells];
  const weeks: (typeof all)[] = [];
  for (let i = 0; i < all.length; i += 7) weeks.push(all.slice(i, i + 7));
  // A month's name above the first week it starts in.
  let lastMonth = -1;
  const labels = weeks.map((w) => {
    const first = w.find(Boolean);
    if (!first) return "";
    const mo = Number(first.day.slice(5, 7)) - 1;
    if (mo === lastMonth) return "";
    lastMonth = mo;
    return MONTH_SHORT[mo];
  });
  const cols = `repeat(${weeks.length}, ${GRID_CELL}px)`;
  const at = (el: HTMLElement) => { const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top }; };
  const shownCell = card ? cells[card.i] : null;
  return (
    <div>
      <div className="flex justify-center">
        <div ref={scroller} className="max-w-full overflow-x-auto px-1 pb-2 pt-1">
          <div className="inline-flex flex-col gap-2">
            <div className="grid" style={{ gridTemplateColumns: cols, columnGap: GRID_GAP }}>
              {labels.map((l, wi) => <div key={wi} className="relative h-4 overflow-visible whitespace-nowrap text-xs text-ink-muted">{l && <span className="absolute left-0">{l}</span>}</div>)}
            </div>
            <div className="grid" style={{ gridTemplateColumns: cols, columnGap: GRID_GAP }}>
              {weeks.map((w, wi) => (
                <div key={wi} className="grid" style={{ gridTemplateRows: `repeat(7, ${GRID_CELL}px)`, rowGap: GRID_GAP }}>
                  {w.map((c, di) => c
                    ? <span key={c.day} data-today={c.day === now || undefined} data-habit-cell role="button" tabIndex={0} aria-label={[c.title, ...(c.lines ?? [])].join(", ")} style={{ width: GRID_CELL, height: GRID_CELL }}
                        onMouseEnter={(e) => { const p = at(e.currentTarget); const i = cells.indexOf(c); setCard((k) => (k?.pinned ? k : { i, ...p, pinned: false })); }}
                        onMouseLeave={() => setCard((k) => (k?.pinned ? k : null))}
                        onFocus={(e) => { const p = at(e.currentTarget); const i = cells.indexOf(c); setCard((k) => (k?.pinned ? k : { i, ...p, pinned: false })); }}
                        onBlur={() => setCard((k) => (k?.pinned ? k : null))}
                        onClick={(e) => { const p = at(e.currentTarget); const i = cells.indexOf(c); setCard((k) => (k?.pinned && k.i === i ? null : { i, ...p, pinned: true })); }}
                        onKeyDown={(e) => { if (e.key === "Escape") setCard(null); }}
                        className={cn("rounded-[2px]",
                          // Today: a hairline outline with a 1px gap (transparent, so it suits any card), around a solid cell.
                          c.day === now ? cn(c.off ? "bg-overlay/10" : GRID_GREEN[c.level], "outline outline-1 outline-offset-1 outline-ink/40")
                            : c.off ? "border border-dashed border-overlay/15" : GRID_GREEN[c.level])} />
                    : <span key={`e${di}`} style={{ width: GRID_CELL, height: GRID_CELL }} />)}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-center gap-1.5 text-xs text-ink-muted">
        <span>No activity</span>
        {GRID_GREEN.map((bg) => <span key={bg} className={cn("h-[11px] w-[11px] rounded-[2px]", bg)} />)}
        <span>High</span>
        <span className="ml-3 h-[11px] w-[11px] rounded-[2px] border border-dashed border-overlay/15" /> <span>Not planned</span>
      </div>
      {card && shownCell && createPortal(
        <div role="tooltip" className={cn("pointer-events-none fixed z-[200] max-w-[min(320px,calc(100vw-24px))] -translate-y-full", HOVER_CARD)}
          style={{ left: Math.min(Math.max(12, card.x - 160), window.innerWidth - Math.min(320, window.innerWidth - 24) - 12), top: card.y - 8 }}>
          <div className="mb-1 font-display text-base tracking-[-0.02em] text-ink">{shownCell.title}</div>
          {(shownCell.lines ?? []).map((l, i) => <div key={i} className="text-ink-muted">{l}</div>)}
        </div>,
        document.body,
      )}
    </div>
  );
}

/** One habit in full: streaks, score, a year's grid (picked in the year dropdown), recent check-ins, and edit / archive / delete. */
export function HabitDetail({ habit: h, byDay, year, years, onYear, onClose, onEdit, onArchive, onDelete }: {
  habit: Habit; byDay?: Map<string, HabitEntry>; year: number; years: number[]; onYear: (y: number) => void; onClose: () => void; onEdit: () => void; onArchive: () => Promise<void>; onDelete: () => void;
}) {
  const now = today();
  const [busy, setBusy] = useState(false);
  const entries = useMemo(() => [...(byDay?.values() ?? [])].sort((a, b) => b.day.localeCompare(a.day)), [byDay]);
  const rate = successRate(h, byDay, 30, now);
  const cells = useMemo(() => {
    const out = [];
    for (let d = `${year}-01-01`; d <= `${year}-12-31`; d = addDays(d, 1)) {
      const e = byDay?.get(d);
      const planned = isPlanned(h, d);
      if (d > now) { out.push({ day: d, level: 0, off: true, title: `${longDay(d)}: not yet` }); continue; }
      const label = e?.skipped ? "skipped" : e ? (h.kind === "count" ? `${e.value} ${h.unit}`.trim() : h.kind === "duration" || h.kind === "sleep" ? minutesLabel(e.value) : "done") : planned ? "missed" : "not planned";
      out.push({ day: d, level: levelOf(progress(h, e)), off: (!planned && !e) || !!e?.skipped, title: `${longDay(d)}: ${d === now && !e ? "not yet" : label}`, lines: planned || e ? [habitDayLine(h, e, d, now)] : [] });
    }
    return out;
  }, [h, byDay, now, year]);
  const sleep = h.kind === "sleep" && entries.length ? entries.slice(0, 30) : null;

  const stat = (label: string, value: string | number) => (
    <div className="border border-overlay/10 bg-canvas-raised/60 px-4 py-3">
      <p className="text-xs text-ink-muted">{label}</p>
      <p className="mt-1 font-display text-2xl text-ink">{value}</p>
    </div>
  );

  return (
    <GlassSheet label={h.name} onClose={onClose} wide>
      <p className="-mt-3 text-sm text-ink-muted">
        {[scaleLabel(h.scale), kindLabel(h.kind), goalLabel(h) && `goal ${goalLabel(h)}`, daysLabel(h.days), categoryLabel(h.category)].filter(Boolean).join(" · ")}
        {h.archived && " · archived"}
      </p>
      {h.cue && <p className="-mt-3 text-sm italic text-ink-faint">{h.cue}</p>}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {stat("Current streak", currentStreak(h, byDay, now))}
        {stat("Best streak", bestStreak(h, byDay, now))}
        {stat("Last 30 days", rate === null ? "–" : `${Math.round(rate * 100)}%`)}
        {sleep ? stat("Average sleep", minutesLabel(Math.round(sleep.reduce((a, e) => a + e.value, 0) / sleep.length))) : stat("Check-ins", entries.filter((e) => isDone(h, e)).length)}
      </div>
      <section>
        <div className="mb-3 flex items-center justify-between gap-3">
          <h3 className="text-sm uppercase tracking-wide text-ink-muted">Consistency</h3>
          <YearSelect year={year} years={years} onChange={onYear} className="text-sm text-ink-muted" />
        </div>
        <HabitGrid cells={cells} />
      </section>
      <section>
        <h3 className="mb-2 text-sm uppercase tracking-wide text-ink-muted">Recent check-ins</h3>
        {entries.length === 0 ? <p className="text-sm text-ink-faint">No check-ins yet.</p> : (
          <ul className="flex flex-col divide-y divide-overlay/10">
            {entries.slice(0, 10).map((e) => (
              <li key={e.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                <span className="text-ink">{dayLabel(e.day, now)}</span>
                <span className="min-w-0 truncate text-right text-ink-muted">
                  {e.skipped ? "Skipped" : h.kind === "sleep" && e.bedTime && e.wakeTime ? `${minutesLabel(e.value)} · ${clock(e.bedTime)} – ${clock(e.wakeTime)}${e.quality ? ` · ${QUALITY[e.quality - 1]}` : ""}`
                    : h.kind === "count" ? `${e.value.toLocaleString()}${h.unit ? ` ${h.unit}` : ""} of ${h.target.toLocaleString()}`
                    : h.kind === "duration" ? `${minutesLabel(e.value)} of ${minutesLabel(h.target)}`
                    : h.kind === "quit" ? "Avoided" : "Done"}
                  {e.note && ` · ${e.note}`}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
      <div className="flex flex-wrap justify-end gap-2">
        <GlassButton type="button" onClick={onDelete}><Trash2 className="h-4 w-4" />Delete</GlassButton>
        <GlassButton type="button" disabled={busy} onClick={async () => { setBusy(true); try { await onArchive(); } finally { setBusy(false); } }}>
          {busy ? <ButtonWheel /> : h.archived ? <ArchiveRestore className="h-4 w-4" /> : <Archive className="h-4 w-4" />}{h.archived ? "Restore" : "Archive"}
        </GlassButton>
        {!h.archived && <GlassButton type="button" strong onClick={onEdit}><Pencil className="h-4 w-4" />Edit</GlassButton>}
      </div>
      <p className="-mt-2 flex items-center justify-end gap-1.5 text-xs text-ink-faint"><Flame className="h-3.5 w-3.5" aria-hidden />Tick any of the last 7 days from the day circles; older days are locked.</p>
    </GlassSheet>
  );
}
