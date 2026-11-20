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
export interface DropdownItem { id: string; label: string; meta?: string }
/** `title` "" = a group without a heading. */
export interface DropdownGroup { title: string; items: DropdownItem[] }

type Pos = { left: number; width: number; maxHeight: number; top?: number; bottom?: number };

function DropdownMenu({ anchor, groups, value, onSelect, onClose, label, minWidth = 0 }: {
  anchor: React.RefObject<HTMLElement>; groups: DropdownGroup[]; value: string; onSelect: (id: string) => void; onClose: () => void; label: string; minWidth?: number;
}) {
  const menu = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<Pos | null>(null);

  const place = () => {
    const r = anchor.current?.getBoundingClientRect();
    if (!r) return;
    const width = Math.min(Math.max(r.width, minWidth), window.innerWidth - 24);
    const left = Math.max(12, Math.min(r.left, window.innerWidth - width - 12));
    const below = window.innerHeight - r.bottom - 16;
    const above = r.top - 16;
    // at most ~8 rows tall, then it scrolls; opens upwards when there is clearly more room above
    if (below < 220 && above > below) setPos({ left, width, bottom: window.innerHeight - r.top + 6, maxHeight: Math.min(320, above) });
    else setPos({ left, width, top: r.bottom + 6, maxHeight: Math.max(160, Math.min(320, below)) });
  };
  useLayoutEffect(place, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const onDown = (e: PointerEvent) => {
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
    <div ref={menu} role="listbox" aria-label={label} onKeyDown={onMenuKey}
      className="glass-in fixed z-[160] overflow-hidden rounded-none border border-overlay/10 bg-canvas-raised shadow-themed"
      style={{ top: pos.top, bottom: pos.bottom, left: pos.left, width: pos.width }}>
      <div className="overflow-y-auto py-1" style={{ maxHeight: pos.maxHeight }}>
        {groups.map((g, gi) => (
          <div key={g.title || `g${gi}`} className={cn(gi > 0 && "mt-1 border-t border-overlay/10 pt-1")}>
            {g.title && <p className="px-4 pb-1.5 pt-2 text-xs uppercase tracking-wide text-ink-muted">{g.title}</p>}
            {g.items.map((it) => {
              const on = it.id === value;
              return (
                <button key={it.id || "none"} type="button" role="option" aria-selected={on} onClick={() => { onSelect(it.id); onClose(); anchor.current?.focus(); }}
                  className={cn("flex w-full items-center gap-3 px-4 py-2 text-left text-sm normal-case tracking-normal outline-none transition-colors focus-visible:bg-overlay/[0.07]", on ? "bg-ink text-canvas" : "text-ink")}>
                  <Check className={cn("h-4 w-4 shrink-0", on ? "opacity-100" : "opacity-0")} strokeWidth={2.25} aria-hidden />
                  <span className="flex-1 truncate">{it.label}</span>
                  {it.meta && <span className={cn("shrink-0 text-xs tabular-nums", on ? "text-canvas/70" : "text-ink-faint")}>{it.meta}</span>}
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>,
    document.body,
  );
}

/** A wide liquid glass button showing the chosen value, with the menu exactly as wide as the button. */
export function GlassDropdown({ value, display, groups, onSelect, label, className }: {
  value: string; display: string; groups: DropdownGroup[]; onSelect: (id: string) => void; label: string; className?: string;
}) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  return (
    <>
      <button ref={trigger} type="button" onClick={() => setOpen((o) => !o)} aria-haspopup="listbox" aria-expanded={open} aria-label={`${label}: ${display}`}
        className={cn("glass-fab relative inline-flex h-12 w-full items-center justify-between gap-3 rounded-2xl px-4 text-left text-sm text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-medium", className)}>
        <span className="absolute inset-0" aria-hidden><LiquidGlass width="100%" height="100%" radius={16} blur={4} /></span>
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
