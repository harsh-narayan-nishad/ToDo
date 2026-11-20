"use client";
import React, { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { ButtonWheel } from "@/components/WheelSpinner";
import LiquidGlass from "@/components/LiquidGlass";
import { ChevronLeft, ChevronRight } from "lucide-react";

// Same look as the main app: pill buttons, underlined fields, soft raised cards.
type Variant = "primary" | "ghost" | "outline" | "danger";
const variants: Record<Variant, string> = {
  primary: "bg-ink text-canvas",
  ghost: "bg-transparent text-ink",
  outline: "bg-transparent border border-overlay/15 text-ink",
  danger: "bg-accent-extreme/90 text-white",
};

export function Button({ variant = "primary", size = "md", className, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: "sm" | "md" | "lg" }) {
  const sizes = { sm: "h-8 px-3.5 text-sm", md: "h-10 px-5 text-sm", lg: "h-12 px-6 text-base" };
  return (
    <button
      className={cn("inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-none font-medium transition-colors duration-150 disabled:pointer-events-none disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-medium", variants[variant], sizes[size], className)}
      {...props}
    />
  );
}

export const FIELD = "mt-1 block w-full border-0 border-b border-ink/40 bg-transparent pb-2 pt-1 text-base text-ink outline-none transition-colors placeholder:text-ink-faint focus:border-accent-medium";
export const LABEL = "block text-sm text-ink-muted";

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-none border border-overlay/10 bg-canvas-raised p-5 sm:p-6", className)} {...props} />;
}

const tones = {
  neutral: "bg-overlay/10 text-ink-muted",
  green: "bg-accent-medium/15 text-accent-medium",
  amber: "bg-accent-fast/15 text-accent-fast",
  red: "bg-accent-extreme/15 text-accent-extreme",
  blue: "bg-accent-slow/15 text-accent-slow",
};
export function Badge({ tone = "neutral", children }: { tone?: keyof typeof tones; children: React.ReactNode }) {
  return <span className={cn("inline-flex items-center rounded-none px-2.5 py-0.5 text-xs font-medium", tones[tone])}>{children}</span>;
}

export function Stat({ label, value, hint, tone }: { label: string; value: number | string; hint?: string; tone?: "green" | "amber" | "red" | "blue" }) {
  const color = tone ? { green: "text-accent-medium", amber: "text-accent-fast", red: "text-accent-extreme", blue: "text-accent-slow" }[tone] : "text-ink";
  return (
    <Card className="p-4 sm:p-5">
      <p className="text-sm text-ink-muted">{label}</p>
      <p className={cn("mt-1 font-display text-3xl", color)}>{value}</p>
      {hint && <p className="mt-1 text-xs text-ink-faint">{hint}</p>}
    </Card>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <p className="rounded-none border border-dashed border-overlay/15 px-6 py-12 text-center text-sm text-ink-muted">{children}</p>;
}

export function Pager({ page, total, limit, onPage }: { page: number; total: number; limit: number; onPage: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / limit));
  if (pages <= 1) return <p className="text-sm text-ink-faint">{total} total</p>;
  return (
    <div className="flex items-center justify-between gap-3 text-sm text-ink-muted">
      <span>{total} total</span>
      <div className="flex items-center gap-2">
        <PageButton label="Previous page" disabled={page <= 1} onClick={() => onPage(page - 1)}><ChevronLeft className="h-4 w-4" /></PageButton>
        <span className="tabular-nums">Page {page} of {pages}</span>
        <PageButton label="Next page" disabled={page >= pages} onClick={() => onPage(page + 1)}><ChevronRight className="h-4 w-4" /></PageButton>
      </div>
    </div>
  );
}

/** A round liquid glass button for the pager. */
function PageButton({ label, disabled, onClick, children }: { label: string; disabled: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" aria-label={label} title={label} disabled={disabled} onClick={onClick}
      className="glass-fab relative grid h-10 w-10 shrink-0 place-items-center rounded-full text-ink disabled:pointer-events-none disabled:opacity-35 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-medium">
      <span className="pointer-events-none absolute inset-0" aria-hidden><LiquidGlass width="100%" height="100%" radius={20} blur={3} /></span>
      <span className="pointer-events-none relative">{children}</span>
    </button>
  );
}

/** Confirmation popup. `reason` = ask for a note (required when `reasonRequired`). */
export function ConfirmDialog({ title, body, confirmLabel, danger, reason, reasonRequired, onConfirm, onClose }: {
  title: string; body?: string; confirmLabel: string; danger?: boolean; reason?: boolean; reasonRequired?: boolean;
  onConfirm: (reason: string) => Promise<void>; onClose: () => void;
}) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    ref.current?.focus();
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onClose]);

  async function submit() {
    if (reasonRequired && text.trim().length < 3) { setError("Please give a short reason."); return; }
    setBusy(true);
    setError(null);
    try { await onConfirm(text.trim()); onClose(); } catch (e) { setError(e instanceof Error ? e.message : "Failed"); setBusy(false); }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 px-4" role="dialog" aria-modal="true" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-md rounded-none border border-overlay/10 bg-canvas-raised p-6 shadow-themed sm:p-8">
        <h2 className="font-display text-2xl">{title}</h2>
        {body && <p className="mt-2 text-sm text-ink-muted">{body}</p>}
        {reason && (
          <label className={cn(LABEL, "mt-5")}>
            Reason{reasonRequired ? "" : " (optional)"}
            <textarea ref={ref} value={text} onChange={(e) => setText(e.target.value)} rows={2} maxLength={500} className={cn(FIELD, "resize-none")} />
          </label>
        )}
        {error && <p className="mt-3 text-sm text-accent-extreme" role="alert">{error}</p>}
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button variant={danger ? "danger" : "primary"} onClick={() => void submit()} disabled={busy}>{busy && <ButtonWheel />}{busy ? "Please wait…" : confirmLabel}</Button>
        </div>
      </div>
    </div>
  );
}
