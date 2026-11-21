"use client";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronRight, Compass, History, Menu, MoreHorizontal, Moon, Palette, Sun, X } from "lucide-react";
import type { User } from "@/lib/api";
import { cn } from "@/lib/utils";
import { TabIcon } from "@/components/TabIcons";

/** iOS Settings-style pieces: a rounded group of rows, and one row (coloured icon tile, label, value, chevron or tick). */
function Group({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <div className="mb-7">
      {title && <p className="mb-1.5 px-4 text-[13px] uppercase tracking-wide text-ink-muted">{title}</p>}
      <div className="ios-group overflow-hidden rounded-[14px]">{children}</div>
    </div>
  );
}
function Row({ icon: Icon, tint, label, value, mark = "chevron", danger, onClick, last, current, expanded }: {
  icon?: typeof Menu; tint?: string; label: string; value?: string; mark?: "chevron" | "check" | "none"; danger?: boolean; onClick: () => void; last?: boolean;
  current?: boolean; expanded?: boolean;
}) {
  return (
    <button type="button" onClick={onClick} aria-current={current ? "page" : undefined} aria-expanded={expanded}
      className="flex w-full items-center gap-3 pl-4 text-left transition-colors active:bg-overlay/[0.06]">
      {Icon && <span className="grid h-[29px] w-[29px] shrink-0 place-items-center rounded-[7px] text-white" style={{ backgroundColor: tint }}><Icon className="h-[17px] w-[17px]" strokeWidth={2} aria-hidden /></span>}
      <span className={cn("flex min-h-[46px] flex-1 items-center gap-2 py-2.5 pr-4", !last && "border-b border-overlay/10", !Icon && danger && "justify-center")}>
        <span className={cn("flex-1 truncate text-[17px]", danger ? "text-center text-accent-extreme" : "text-ink")}>{label}</span>
        {value && <span className="shrink-0 text-[17px] text-ink-muted">{value}</span>}
        {mark === "chevron" && <ChevronRight className={cn("h-4 w-4 shrink-0 text-ink-faint transition-transform", expanded && "rotate-90")} aria-hidden />}
        {mark === "check" && <Check className="h-[18px] w-[18px] shrink-0 text-[#007AFF]" strokeWidth={2.5} aria-hidden />}
      </span>
    </button>
  );
}
/** Icon tile colours per section, as in iOS Settings. */
const TINT: Record<string, string> = { tasks: "#007AFF", habits: "#34C759", profile: "#8E8E93", calendar: "#FF3B30" };

/**
 * The hamburger menu, built like Pacewise's (Pacewise/components/Navigation/HamburgerMenu.tsx): a drawer from the
 * right over a dimmed page. Laid out like iOS Settings: the account on top, then rounded groups of rows (the
 * sections on phones; History and Theme), and Log out on its own.
 */
export function HamburgerMenu({ user, light, setLight, onHistory, onSignOut, sections, current, onSection, tab = false, tabActive = false, onTour }: {
  user: User; light: boolean; setLight: (v: boolean) => void; onHistory: () => void; onSignOut: () => void;
  /** Phones only: the section tabs (Tasks, Habits, Profile, Calendar) live in this menu instead of on the page. */
  sections?: { id: string; label: string; icon: typeof Menu }[]; current?: string; onSection?: (id: string) => void;
  /** Phones: shown as the "More" item of the bottom tab bar; `tabActive` when the open section lives in this menu. */
  tab?: boolean; tabActive?: boolean;
  /** "Take the tour": the guided tour that adds a first task. */
  onTour?: () => void;
}) {
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  const [section, setSection] = useState<"theme" | null>(null);
  useEffect(() => setMounted(true), []);

  /** Slide out, then unmount. */
  const close = () => {
    setClosing(true);
    setTimeout(() => { setOpen(false); setClosing(false); setSection(null); }, 230);
  };
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      {tab ? (
        <button type="button" onClick={() => setOpen(true)} aria-label="More" aria-haspopup="dialog"
          className="flex flex-1 flex-col items-center gap-[3px] pb-1 pt-1.5 text-[10px] font-medium tracking-[0.01em]" style={{ color: tabActive || open ? "#007AFF" : "#8E8E93" }}>
          <TabIcon name="more" active={tabActive || open} />
          More
        </button>
      ) : (
      <button type="button" onClick={() => setOpen(true)} aria-label="Open menu" aria-haspopup="dialog"
        className="ios-circle-btn flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[#007AFF] transition-transform active:scale-95">
        {/* iOS "more" button: three dots in system blue */}
        <MoreHorizontal className="h-[22px] w-[22px]" strokeWidth={2.25} />
      </button>
      )}

      {mounted && open && createPortal(
        <>
          <div className={cn("fixed inset-0 z-[90] bg-[rgb(var(--shadow-color))]/50", closing ? "fade-out" : "fade-in")} onClick={close} />
          <div role="dialog" aria-modal="true" aria-label="Menu"
            className={cn("ios-grouped-bg fixed inset-y-0 right-0 z-[95] flex w-[92vw] max-w-md flex-col border-l border-overlay/10 bg-canvas shadow-themed", closing ? "drawer-out" : "drawer-in")}>
            <div className="flex items-center justify-between gap-4 px-5 pb-1 pt-5">
              <h2 className="text-[34px] font-semibold leading-tight tracking-[-0.02em] text-ink">Menu</h2>
              <button type="button" onClick={close} aria-label="Close menu" className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-overlay/[0.08] text-ink-muted transition-colors active:scale-95">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-4 pb-8 pt-4">
              {/* The account, like the Apple ID card at the top of Settings. */}
              <div className="ios-group mb-7 flex items-center gap-3.5 rounded-[14px] px-4 py-3.5">
                <span className="grid h-14 w-14 shrink-0 place-items-center rounded-full bg-gradient-to-b from-[#A1A1A6] to-[#7C7C80] text-xl font-medium uppercase text-white">{user.name.trim().charAt(0) || "?"}</span>
                <span className="min-w-0">
                  <span className="block truncate text-[20px] text-ink">{user.name}</span>
                  <span className="block truncate text-[13px] text-ink-muted">@{user.username}</span>
                </span>
              </div>

              {sections && onSection && (
                <nav className="md:hidden" aria-label="Sections">
                  <Group>
                    {sections.map(({ id, label, icon }, i) => (
                      <Row key={id} icon={icon} tint={TINT[id] ?? "#8E8E93"} label={label} mark={current === id ? "check" : "chevron"} current={current === id}
                        last={i === sections.length - 1} onClick={() => { onSection(id); close(); }} />
                    ))}
                  </Group>
                </nav>
              )}

              <Group title="Your To-do">
                {onTour && <Row icon={Compass} tint="#34C759" label="Take the tour" onClick={() => { close(); onTour(); }} />}
                {/* History lives here instead of in the section tabs. */}
                <Row icon={History} tint="#FF9500" label="History" onClick={() => { onHistory(); close(); }} />
                <Row icon={Palette} tint="#5856D6" label="Theme" value={light ? "Light" : "Dark"} expanded={section === "theme"} last={section !== "theme"}
                  onClick={() => setSection(section === "theme" ? null : "theme")} />
                {section === "theme" && ([[true, "Light", Sun], [false, "Dark", Moon]] as const).map(([isLight, label, Icon], i) => (
                  <div key={label} className="pl-11">
                    <Row icon={Icon} tint={isLight ? "#FFCC00" : "#636366"} label={label} mark={light === isLight ? "check" : "none"} last={i === 1} onClick={() => setLight(isLight)} />
                  </div>
                ))}
              </Group>

              <Group>
                <Row label="Log out" danger mark="none" last onClick={() => { close(); onSignOut(); }} />
              </Group>
            </div>
          </div>
        </>,
        document.body,
      )}
    </>
  );
}
