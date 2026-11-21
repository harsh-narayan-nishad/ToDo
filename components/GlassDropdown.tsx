"use client";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown } from "lucide-react";
import LiquidGlass from "@/components/LiquidGlass";
import { cn } from "@/lib/utils";

/**
 * The app's own dropdown menu (used instead of the system pop-up everywhere in the planner): a solid To-do panel
 * with titled groups, a check and an ink bar on the chosen item, and an optional quiet detail on the right
 * (a date range, a count). It floats above everything (so a scrolling panel never cuts it off), opens below its
 * button or above it when there is no room, and Escape or a click outside closes only the menu.
 *
 * Triggers: GlassDropdown (a wide glass button showing the value), RoundMenuButton (a small round glass ⌄),
 * and CellSelect (a plain spreadsheet cell showing the value).
 */
export interface DropdownItem { id: string; label: string; meta?: string; /** An icon in place of the check (action menus). */ icon?: typeof Check; /** Shown in red (e.g. Delete). */ danger?: boolean }
/** `title` "" = a group without a heading. */
export interface DropdownGroup { title: string; items: DropdownItem[] }

type Pos = { left: number; width: number; maxHeight: number; top?: number; bottom?: number; /** where the button is */ a: { top: number; left: number; width: number; height: number } };

export function DropdownMenu({ anchor, groups, value, onSelect, onClose, label, minWidth = 0, soft = false, ghost }: {
  anchor: React.RefObject<HTMLElement>; groups: DropdownGroup[]; value: string; onSelect: (id: string) => void; onClose: () => void; label: string; minWidth?: number;
  /** A pull-down menu: rounded frosted panel, full-width rows with thin separators, a tick on the chosen one. */
  soft?: boolean;
  /** Pull-down style: the button as it looks, drawn sharp above the dimmed screen at the button's place (the real one is under the blur). */
  ghost?: React.ReactNode;
}) {
  const menu = useRef<HTMLDivElement>(null);
  const backdrop = useRef<HTMLDivElement>(null);
  const ghostRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<Pos | null>(null);

  const place = () => {
    const r = anchor.current?.getBoundingClientRect();
    if (!r) return;
    const width = Math.min(Math.max(r.width, minWidth), window.innerWidth - 24);
    const left = Math.max(12, Math.min(r.left, window.innerWidth - width - 12));
    const below = window.innerHeight - r.bottom - 16;
    const above = r.top - 16;
    // at most ~8 rows tall, then it scrolls; opens upwards when there is clearly more room above
    const a = { top: r.top, left: r.left, width: r.width, height: r.height };
    if (below < 220 && above > below) setPos({ left, width, bottom: window.innerHeight - r.top + 6, maxHeight: Math.min(320, above), a });
    else setPos({ left, width, top: r.bottom + 6, maxHeight: Math.max(160, Math.min(320, below)), a });
  };
  useLayoutEffect(place, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      // the backdrop and the button's copy close on their own click, so the tap goes nowhere else
      if ((backdrop.current && e.target === backdrop.current) || ghostRef.current?.contains(e.target as Node)) return;
      if (!menu.current?.contains(e.target as Node) && !anchor.current?.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopImmediatePropagation(); onClose(); anchor.current?.focus(); } };
    document.addEventListener("pointerdown", onDown, true);
    window.addEventListener("keydown", onKey, true); // first, so the panel underneath stays open
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      document.removeEventListener("pointerdown", onDown, true);
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const sel = menu.current?.querySelector<HTMLElement>("[aria-selected='true']") ?? menu.current?.querySelector<HTMLElement>("[role='option']");
    sel?.focus();
    sel?.scrollIntoView({ block: "nearest" });
  }, [pos === null]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Arrow keys move between items inside the open menu. */
  const onMenuKey = (e: React.KeyboardEvent) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    const items = [...(menu.current?.querySelectorAll<HTMLElement>("[role='option']") ?? [])];
    const i = items.indexOf(document.activeElement as HTMLElement);
    items[(i + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length]?.focus();
  };

  if (!pos) return null;
  return createPortal(
    <>
    {/* Pull-down style: the screen behind dims and blurs while the menu is open; a tap there closes it (and reaches nothing underneath). */}
    {soft && <div ref={backdrop} className="pw-menu-backdrop fade-in fixed inset-0 z-[155]" aria-hidden onClick={onClose} />}
    {soft && ghost && (
      <div ref={ghostRef} className="fixed z-[158] cursor-pointer" style={pos.a} aria-hidden onClick={onClose}>{ghost}</div>
    )}
    <div ref={menu} role="listbox" aria-label={label} onKeyDown={onMenuKey}
      className={soft ? "pw-menu glass-in fixed z-[160] overflow-hidden rounded-[14px]" : "glass-in fixed z-[160] overflow-hidden rounded-none border border-overlay/10 bg-canvas-raised shadow-themed"}
      style={{ top: pos.top, bottom: pos.bottom, left: pos.left, width: pos.width }}>
      <div className={cn("overflow-y-auto", !soft && "py-1")} style={{ maxHeight: pos.maxHeight }}>
        {groups.map((g, gi) => (
          <div key={g.title || `g${gi}`} className={cn(gi > 0 && (soft ? "border-t-[7px] border-overlay/[0.07]" : "mt-1 border-t border-overlay/10 pt-1"))}>
            {g.title && <p className={soft ? "px-4 pb-1 pt-2.5 text-[13px] text-ink-muted" : "px-4 pb-1.5 pt-2 text-xs uppercase tracking-wide text-ink-muted"}>{g.title}</p>}
            {g.items.map((it, ii) => {
              const on = it.id === value;
              if (soft) return (
                <button key={it.id || "none"} type="button" role="option" aria-selected={on} onClick={() => { onSelect(it.id); onClose(); anchor.current?.focus(); }}
                  className={cn("flex w-full items-center gap-2.5 px-4 py-[11px] text-left text-[16px] outline-none transition-colors active:bg-overlay/[0.08] focus-visible:bg-overlay/[0.07]", ii < g.items.length - 1 && "border-b border-overlay/10", it.danger ? "text-[#F2453D]" : "text-ink")}>
                  {/* action items (with an icon, shown on the right) need no tick column */}
                  {!it.icon && <Check className={cn("h-4 w-4 shrink-0", on ? "opacity-100" : "opacity-0")} strokeWidth={2.5} aria-hidden />}
                  <span className="flex-1 truncate">{it.label}</span>
                  {it.meta && <span className="shrink-0 text-[15px] tabular-nums text-ink-faint">{it.meta}</span>}
                  {it.icon && <it.icon className="h-[18px] w-[18px] shrink-0" strokeWidth={1.75} aria-hidden />}
                </button>
              );
              return (
                <button key={it.id || "none"} type="button" role="option" aria-selected={on} onClick={() => { onSelect(it.id); onClose(); anchor.current?.focus(); }}
                  className={cn("flex w-full items-center gap-3 px-4 py-2 text-left text-sm normal-case tracking-normal outline-none transition-colors focus-visible:bg-overlay/[0.07]", on ? "bg-ink text-canvas" : it.danger ? "text-accent-extreme" : "text-ink")}>
                  {it.icon ? <it.icon className={cn("h-4 w-4 shrink-0", !on && !it.danger && "text-ink-muted")} strokeWidth={1.75} aria-hidden />
                    : <Check className={cn("h-4 w-4 shrink-0", on ? "opacity-100" : "opacity-0")} strokeWidth={2.25} aria-hidden />}
                  <span className="flex-1 truncate">{it.label}</span>
                  {it.meta && <span className={cn("shrink-0 text-xs tabular-nums", on ? "text-canvas/70" : "text-ink-faint")}>{it.meta}</span>}
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
    </>,
    document.body,
  );
}

/** A wide liquid glass button showing the chosen value, with the menu exactly as wide as the button. */
export function GlassDropdown({ value, display, groups, onSelect, label, className, soft = false }: {
  value: string; display: string; groups: DropdownGroup[]; onSelect: (id: string) => void; label: string; className?: string;
  /** Pull-down look: a pill button and a pull-down menu (phones' To do filter). */
  soft?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  if (soft) return (
    <>
      <button ref={trigger} type="button" onClick={() => setOpen((o) => !o)} aria-haspopup="listbox" aria-expanded={open} aria-label={`${label}: ${display}`}
        className={cn("inline-flex h-10 items-center justify-between gap-2 rounded-full bg-[#3478F6] px-4 text-left text-[15px] font-medium text-white shadow-themed active:scale-[0.97]", className)}>
        <span className="truncate">{display}</span>
        <ChevronDown className={cn("h-4 w-4 shrink-0 text-white/85 transition-transform duration-200", open && "rotate-180")} strokeWidth={2.25} aria-hidden />
      </button>
      {open && <DropdownMenu soft anchor={trigger} groups={groups} value={value} onSelect={onSelect} onClose={() => setOpen(false)} label={label} minWidth={240}
        ghost={<span className="flex h-full w-full items-center justify-between gap-2 rounded-full bg-[#3478F6] px-4 text-[15px] font-medium text-white"><span className="truncate">{display}</span><ChevronDown className="h-4 w-4 shrink-0 rotate-180 text-white/85" strokeWidth={2.25} /></span>} />}
    </>
  );
  return (
    <>
      <button ref={trigger} type="button" onClick={() => setOpen((o) => !o)} aria-haspopup="listbox" aria-expanded={open} aria-label={`${label}: ${display}`}
        className={cn("glass-fab relative inline-flex h-12 w-full items-center justify-between gap-3 rounded-2xl px-4 text-left text-sm text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-medium", className)}>
        <span className="glass-clear absolute inset-0" aria-hidden><LiquidGlass width="100%" height="100%" radius={16} blur={4} /></span>
        <span className="relative truncate">{display}</span>
        <ChevronDown className={cn("relative h-4 w-4 shrink-0 text-ink-muted transition-transform duration-200", open && "rotate-180")} aria-hidden />
      </button>
      {open && <DropdownMenu anchor={trigger} groups={groups} value={value} onSelect={onSelect} onClose={() => setOpen(false)} label={label} />}
    </>
  );
}

/** A small round liquid glass ⌄ that opens the menu (e.g. "set for every row" in a sheet header). */
export function RoundMenuButton({ groups, value = "\u0000", onSelect, label }: { groups: DropdownGroup[]; value?: string; onSelect: (id: string) => void; label: string }) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  return (
    <>
      <button ref={trigger} type="button" onClick={() => setOpen((o) => !o)} aria-haspopup="listbox" aria-expanded={open} aria-label={label} title={label}
        className="glass-fab relative grid h-6 w-6 shrink-0 place-items-center rounded-full text-ink-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-medium">
        <span className="pointer-events-none absolute inset-0" aria-hidden><LiquidGlass width="100%" height="100%" radius={12} blur={2} /></span>
        <ChevronDown className={cn("pointer-events-none relative h-3.5 w-3.5 transition-transform duration-200", open && "rotate-180")} strokeWidth={2} aria-hidden />
      </button>
      {open && <DropdownMenu anchor={trigger} groups={groups} value={value} onSelect={onSelect} onClose={() => setOpen(false)} label={label} minWidth={220} />}
    </>
  );
}

/** A spreadsheet cell that shows its value and opens the menu (no system pop-up). */
export function CellSelect({ value, display, groups, onSelect, label, disabled, muted, className, title, dataCell, onKeyDown, onPaste }: {
  value: string; display: string; groups: DropdownGroup[]; onSelect: (id: string) => void; label: string;
  disabled?: boolean; muted?: boolean; className?: string; title?: string;
  dataCell?: string; onKeyDown?: (e: React.KeyboardEvent) => void; onPaste?: (e: React.ClipboardEvent) => void;
}) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  return (
    <>
      <button ref={trigger} type="button" data-cell={dataCell} disabled={disabled} title={title} onKeyDown={onKeyDown} onPaste={onPaste}
        onClick={() => setOpen((o) => !o)} aria-haspopup="listbox" aria-expanded={open} aria-label={`${label}: ${display}`}
        className={cn("flex h-11 w-full items-center justify-between gap-2 bg-transparent px-3 text-left text-sm outline-none disabled:cursor-default disabled:text-ink-faint", muted ? "text-ink-muted" : "text-ink", className)}>
        <span className="truncate">{display}</span>
        {!disabled && <ChevronDown className={cn("h-4 w-4 shrink-0 text-ink-muted transition-transform duration-200", open && "rotate-180")} aria-hidden />}
      </button>
      {open && <DropdownMenu anchor={trigger} groups={groups} value={value} onSelect={onSelect} onClose={() => setOpen(false)} label={label} minWidth={200} />}
    </>
  );
}
