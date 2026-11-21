"use client";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Archive, ArchiveRestore, Check, Clock, Flame, Pencil, Plus, Sparkles, Trash2, X } from "lucide-react";
import LiquidGlass from "@/components/LiquidGlass";
import { GlassButton } from "@/components/GlassButton";
import { GlassDropdown } from "@/components/GlassDropdown";
import { ButtonWheel } from "@/components/WheelSpinner";
import { AnalogClock, ClockPopup } from "@/components/TaskDialogs";
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

/** The seven weekdays as round toggles, with quick picks. */
function DayPicker({ days, setDays }: { days: number[]; setDays: (d: number[]) => void }) {
  const toggle = (d: number) => {
    const next = days.includes(d) ? days.filter((x) => x !== d) : [...days, d].sort();
    if (next.length) setDays(next);
  };
  const quick: [string, number[]][] = [["Every day", ALL_DAYS], ["Weekdays", [0, 1, 2, 3, 4]], ["Weekends", [5, 6]]];
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2" role="group" aria-label="Days">
        {WEEK.map((w, d) => (
          <button key={w} type="button" onClick={() => toggle(d)} aria-pressed={days.includes(d)} aria-label={w}
            className={cn("grid h-10 w-10 place-items-center rounded-full border text-xs font-medium transition-colors",
              days.includes(d) ? "border-ink bg-ink text-canvas" : "border-overlay/20 text-ink-muted")}>
            {w.slice(0, 2)}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap gap-3 text-xs text-ink-faint">
        {quick.map(([l, d]) => (
          <button key={l} type="button" onClick={() => setDays(d)} className={cn("underline-offset-4", daysLabel(days) === l ? "text-ink underline" : "")}>{l}</button>
        ))}
      </div>
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

  return (
    <GlassSheet label={habit ? "Edit habit" : "New habit"} onClose={onClose}>
      <form onSubmit={(e) => void submit(e)} className="flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <span className={LABEL}>Size</span>
          <Segmented label="Size" value={scale} options={SCALES} onChange={setScale} />
          <p className="text-xs text-ink-faint">{SCALES.find((s) => s.id === scale)?.hint}</p>
        </div>
        <label className={LABEL}>Name
          <input ref={nameRef} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Read, Drink water, No sugar" maxLength={80} className={FIELD} />
        </label>
        {duplicate && <p className="-mt-4 text-xs text-accent-fast">You already track a habit with this name.</p>}
        {ideas.length > 0 && (
          <div className="-mt-3">
            <p className="mb-2 flex items-center gap-1.5 text-xs text-ink-faint"><Sparkles className="h-3.5 w-3.5" aria-hidden />{scaleLabel(scale)} ideas</p>
            <div className="flex flex-wrap gap-2">
              {ideas.map((t) => (
                <button key={t.name} type="button" onClick={() => applyIdea(t)} title={t.cue || t.name}
                  className="inline-flex max-w-full items-center gap-2 rounded-full border border-overlay/15 bg-overlay/5 px-3.5 py-1.5 text-sm text-ink">
                  <span className="truncate">{t.name}</span>
                  <span className="shrink-0 text-xs text-ink-faint">{goalLabel({ ...t, id: "", startDay: "", archived: false, createdAt: "" }) || kindLabel(t.kind).toLowerCase()}</span>
                </button>
              ))}
            </div>
          </div>
        )}
        <div className="flex flex-col gap-2">
          <span className={LABEL}>Type{habit && <span className="ml-2 text-xs text-ink-faint">(can't be changed)</span>}</span>
          <Segmented label="Type" value={kind} options={KINDS.filter((k) => k.id !== "sleep" || kind === "sleep")} onChange={pickKind} disabled={!!habit} />
          <p className="text-xs text-ink-faint">{KINDS.find((k) => k.id === kind)?.hint}</p>
        </div>
        {(kind === "count" || kind === "duration" || kind === "sleep") && (
          <div className="grid grid-cols-2 gap-5">
            <label className={LABEL}>{kind === "sleep" ? "Goal (hours a night)" : kind === "duration" ? "Goal (minutes a day)" : "Goal (a day)"}
              <input type="number" inputMode="decimal" min={1} step={kind === "sleep" ? 0.5 : 1} value={target} onChange={(e) => setTarget(e.target.value)} className={FIELD} />
            </label>
            {kind === "count" && (
              <label className={LABEL}>Unit (optional)
                <input value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="glasses, steps, pages…" maxLength={20} className={FIELD} />
              </label>
            )}
          </div>
        )}
        <div className="flex flex-col gap-2">
          <span className={LABEL}>Days</span>
          <DayPicker days={days} setDays={setDays} />
        </div>
        {kind !== "sleep" && (
          <div className={LABEL}>
            <span>Time (optional)</span>
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => setTimeOpen(true)} aria-label={time ? `Time: ${clock(time)}. Change` : "Pick a time"}
                className={cn(FIELD, "flex items-center justify-between text-left", !time && "text-ink-faint")}>
                <span className="tabular-nums">{time ? clock(time) : "Any time"}</span>
                <Clock className="h-4 w-4 text-ink-muted" aria-hidden />
              </button>
              {time && <button type="button" onClick={() => setTime(null)} aria-label="Clear the time" className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-ink-muted"><X className="h-4 w-4" /></button>}
            </div>
            {timeOpen && (
              <ClockPopup title="Time" onClose={() => setTimeOpen(false)}>
                <AnalogClock label="Time" value={time ?? "07:00"} onChange={setTime} />
              </ClockPopup>
            )}
          </div>
        )}
        {kind !== "sleep" && (
          <div className="flex flex-col gap-2">
            <span className={LABEL}>Category</span>
            <GlassDropdown label="Category" value={category} display={categoryLabel(category)} onSelect={(id) => setCategory(id as HabitCategory)}
              groups={[{ title: "", items: CATEGORIES.filter((c) => c.id !== "sleep").map((c) => ({ id: c.id, label: c.label })) }]} />
          </div>
        )}
        <label className={LABEL}>Cue or reason (optional)
          <input value={cue} onChange={(e) => setCue(e.target.value)} placeholder="After I…, so that I…" maxLength={200} className={FIELD} />
        </label>
        {error && <p className="text-sm text-accent-extreme" role="alert">{error}</p>}
        <div className="flex justify-end gap-2">
          <GlassButton type="button" onClick={onClose} disabled={busy}>Cancel</GlassButton>
          <GlassButton type="submit" strong disabled={busy || !name.trim()}>{busy ? <ButtonWheel /> : habit ? <Check className="h-4 w-4" /> : <Plus className="h-4 w-4" />}{busy ? "Saving…" : habit ? "Save" : "Add habit"}</GlassButton>
        </div>
      </form>
    </GlassSheet>
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
 * The last 26 weeks as a heatmap, drawn like the Profile's Consistency map: rounded cells, month names on top, a
 * green scale, today outlined, and opened scrolled to the current week.
 */
const GRID_CELL = 11;
const GRID_GAP = 3;
const GRID_GREEN = ["bg-overlay/10", "bg-accent-medium/30", "bg-accent-medium/55", "bg-accent-medium/80", "bg-accent-medium"];
const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export function HabitGrid({ cells }: { cells: { day: string; level: number; title: string; off?: boolean }[] }) {
  const scroller = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => { const el = scroller.current; if (el) el.scrollLeft = el.scrollWidth; }, [cells.length]);
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
  return (
    <div>
      <div className="flex justify-center">
        <div ref={scroller} className="max-w-full overflow-x-auto pb-2">
          <div className="inline-flex flex-col gap-2">
            <div className="grid" style={{ gridTemplateColumns: cols, columnGap: GRID_GAP }}>
              {labels.map((l, wi) => <div key={wi} className="relative h-4 overflow-visible whitespace-nowrap text-xs text-ink-muted">{l && <span className="absolute left-0">{l}</span>}</div>)}
            </div>
            <div className="grid" style={{ gridTemplateColumns: cols, columnGap: GRID_GAP }}>
              {weeks.map((w, wi) => (
                <div key={wi} className="grid" style={{ gridTemplateRows: `repeat(7, ${GRID_CELL}px)`, rowGap: GRID_GAP }}>
                  {w.map((c, di) => c
                    ? <span key={c.day} title={c.title} aria-label={c.title} style={{ width: GRID_CELL, height: GRID_CELL }}
                        className={cn("rounded-[2px]", c.off ? "border border-dashed border-overlay/15" : GRID_GREEN[c.level], c.day === now && "ring-2 ring-ink/70 ring-offset-1 ring-offset-canvas")} />
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
    </div>
  );
}

/** One habit in full: streaks, score, the last 26 weeks, recent check-ins, and edit / archive / delete. */
export function HabitDetail({ habit: h, byDay, onClose, onEdit, onArchive, onDelete }: {
  habit: Habit; byDay?: Map<string, HabitEntry>; onClose: () => void; onEdit: () => void; onArchive: () => Promise<void>; onDelete: () => void;
}) {
  const now = today();
  const [busy, setBusy] = useState(false);
  const entries = useMemo(() => [...(byDay?.values() ?? [])].sort((a, b) => b.day.localeCompare(a.day)), [byDay]);
  const rate = successRate(h, byDay, 30, now);
  const cells = useMemo(() => {
    const out = [];
    for (let i = 181; i >= 0; i--) {
      const d = addDays(now, -i);
      const e = byDay?.get(d);
      const planned = isPlanned(h, d);
      const label = e?.skipped ? "skipped" : e ? (h.kind === "count" ? `${e.value} ${h.unit}`.trim() : h.kind === "duration" || h.kind === "sleep" ? minutesLabel(e.value) : "done") : planned ? "missed" : "not planned";
      out.push({ day: d, level: levelOf(progress(h, e)), off: (!planned && !e) || !!e?.skipped, title: `${longDay(d)}: ${d === now && !e ? "not yet" : label}` });
    }
    return out;
  }, [h, byDay, now]);
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
        <h3 className="mb-3 text-sm uppercase tracking-wide text-ink-muted">Last 26 weeks</h3>
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
      <p className="-mt-2 flex items-center justify-end gap-1.5 text-xs text-ink-faint"><Flame className="h-3.5 w-3.5" aria-hidden />Only today can be checked in; past days are locked.</p>
    </GlassSheet>
  );
}
