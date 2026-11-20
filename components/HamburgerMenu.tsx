"use client";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronRight, LogOut, Menu, Moon, Sun, X } from "lucide-react";
import type { User } from "@/lib/api";
import { cn } from "@/lib/utils";

/** A large display-type row with a divider and chevron, as in the Pacewise menu. */
function BigRow({ label, open, onToggle }: { label: string; open: boolean; onToggle: () => void }) {
  return (
    <button type="button" onClick={onToggle} aria-expanded={open} className="flex w-full items-center justify-between py-3 text-left">
      <span className="font-display text-3xl leading-tight tracking-[-0.03em] text-ink sm:text-4xl">{label}</span>
      <span className="flex items-center gap-4">
        <span aria-hidden className="h-9 w-px bg-overlay/15" />
        <ChevronRight className={cn("h-5 w-5 text-ink transition-transform", open && "rotate-90")} />
      </span>
    </button>
  );
}

/**
 * The hamburger menu, built like Pacewise's (Pacewise/components/Navigation/HamburgerMenu.tsx): a drawer from the
 * right over a dimmed page, with big rows. It holds History, the theme, and the signed-in account with Log out.
 */
export function HamburgerMenu({ user, light, setLight, onHistory, onSignOut }: {
  user: User; light: boolean; setLight: (v: boolean) => void; onHistory: () => void; onSignOut: () => void;
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
      <button type="button" onClick={() => setOpen(true)} aria-label="Open menu" aria-haspopup="dialog"
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-ink-muted transition-colors">
        <Menu className="h-5 w-5" />
      </button>

      {mounted && open && createPortal(
        <>
          <div className={cn("fixed inset-0 z-[90] bg-[rgb(var(--shadow-color))]/50", closing ? "fade-out" : "fade-in")} onClick={close} />
          <div role="dialog" aria-modal="true" aria-label="Menu"
            className={cn("fixed inset-y-0 right-0 z-[95] flex w-[92vw] max-w-md flex-col border-l border-overlay/10 bg-canvas shadow-themed", closing ? "drawer-out" : "drawer-in")}>
            <div className="flex items-center gap-4 px-6 pb-2 pt-5">
              <div className="flex min-w-0 flex-1 items-center gap-3 rounded-full bg-overlay/[0.06] px-4 py-3">
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-ink text-xs font-medium uppercase text-canvas">{user.name.trim().charAt(0) || "?"}</span>
                <span className="min-w-0">
                  <span className="block truncate text-base text-ink">{user.name}</span>
                  <span className="block truncate text-xs text-ink-faint">@{user.username}</span>
                </span>
              </div>
              <button type="button" onClick={close} aria-label="Close menu" className="shrink-0 rounded-full p-2 text-ink transition-colors">
                <X className="h-6 w-6" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 pb-6 pt-4">
              <div className="mb-2 text-xs font-medium uppercase tracking-wide text-ink-muted">Your To-do</div>

              {/* History lives here instead of in the section tabs. */}
              <BigRow label="History" open={false} onToggle={() => { onHistory(); close(); }} />

              <BigRow label="Theme" open={section === "theme"} onToggle={() => setSection(section === "theme" ? null : "theme")} />
              {section === "theme" && (
                <div className="mb-4 mt-2 flex gap-2">
                  {([[false, "Dark", Moon], [true, "Light", Sun]] as const).map(([isLight, label, Icon]) => (
                    <button key={label} type="button" onClick={() => setLight(isLight)} aria-pressed={light === isLight}
                      className={cn("inline-flex h-12 items-center gap-2 rounded-full px-5 text-sm font-medium transition-colors",
                        light === isLight ? "bg-ink text-canvas" : "border border-overlay/15 text-ink")}>
                      <Icon className="h-4 w-4" /> {label}
                    </button>
                  ))}
                </div>
              )}

              <div className="mt-6 border-t border-overlay/10 pt-5 text-base text-ink-muted">Signed in as <span className="text-ink">{user.name}</span></div>
              <button type="button" onClick={() => { close(); onSignOut(); }} className="mt-4 flex items-center gap-2 text-base text-accent-extreme transition-opacity">
                <LogOut className="h-4 w-4" /> Log out
              </button>
            </div>
          </div>
        </>,
        document.body,
      )}
    </>
  );
}
