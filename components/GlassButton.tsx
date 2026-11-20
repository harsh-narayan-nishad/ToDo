"use client";
import LiquidGlass from "@/components/LiquidGlass";
import { cn } from "@/lib/utils";

/** A pill button in liquid glass, for the New task panel and the planner. `strong` = the main action (bolder, lightly tinted). */
export function GlassButton({ strong, className, children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { strong?: boolean }) {
  return (
    <button {...props}
      className={cn("glass-fab relative inline-flex h-11 items-center justify-center gap-2 rounded-full px-6 text-sm text-ink disabled:pointer-events-none disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-medium", strong && "font-semibold", className)}>
      <span className="absolute inset-0" aria-hidden><LiquidGlass width="100%" height="100%" radius={22} blur={4} /></span>
      {strong && <span className="absolute inset-0 rounded-full bg-overlay/10" aria-hidden />}
      <span className="relative inline-flex items-center gap-2">{children}</span>
    </button>
  );
}
