import { cn } from "@/lib/utils";

/** The Pacewise wordmark with a "To-do" tag, the same way the admin app marks itself. */
export function Logo({ size = "md", className }: { size?: "md" | "lg"; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)} aria-label="Pacewise To-do">
      <span className={cn("font-medium tracking-tight text-ink", size === "lg" ? "text-2xl" : "text-[15px]")}>Pacewise</span>
      <span className={cn("rounded-none border border-overlay/15 px-2.5 py-0.5 font-medium uppercase tracking-wide text-ink-muted", size === "lg" ? "text-xs" : "text-[10px]")}>To-do</span>
    </span>
  );
}
