"use client";
import { useEffect, useState } from "react";
import { Compass } from "lucide-react";
import { PanelLoader } from "@/components/WheelSpinner";
import LiquidGlass from "@/components/LiquidGlass";

/**
 * Docs: how To-do works, as the guided tour shows it, one step at a time with a real screenshot of each step
 * (public/docs/tour: the images and steps.json, captured from the tour itself). "Take the tour" plays it live.
 */
interface DocStep { file: string; title: string; tag: "Required" | "Optional" | null; step: string | null; body: string }

export function DocsPanel({ onTour }: { onTour: () => void }) {
  const [steps, setSteps] = useState<DocStep[] | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    fetch("/docs/tour/steps.json").then((r) => r.json()).then((s: DocStep[]) => setSteps(s), () => setError(true));
  }, []);

  return (
    <div className="flex flex-col gap-6 pb-40">
      <div className="pw-card rounded-[20px] bg-canvas-raised p-5">
        <h2 className="text-[20px] font-semibold tracking-[-0.01em] text-ink">Getting started</h2>
        <p className="mt-1.5 text-[15px] leading-snug text-ink-muted">
          Everything in To-do, step by step: adding a task with the planner, each field (and which ones are optional), the calendar preview, ticking a task off, and notifications. Read it below, or let the tour walk you through it in the app.
        </p>
        {/* liquid glass, tinted with the Pacewise blue */}
        <button type="button" onClick={onTour}
          className="glass-fab relative mt-4 inline-flex h-11 items-center gap-2 overflow-hidden rounded-full px-5 text-[15px] font-semibold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-medium">
          <span className="absolute inset-0" aria-hidden><LiquidGlass width="100%" height="100%" radius={22} blur={4} /></span>
          <span className="absolute inset-0 rounded-full bg-gradient-to-b from-[#4C8DFF]/85 to-[#3478F6]/80" aria-hidden />
          <span className="absolute inset-x-3 top-0 h-1/2 rounded-full bg-gradient-to-b from-white/35 to-transparent" aria-hidden />
          <span className="relative inline-flex items-center gap-2 drop-shadow-sm"><Compass className="h-4 w-4" strokeWidth={2.25} aria-hidden /> Take the tour</span>
        </button>
      </div>

      {error && <p className="text-sm text-accent-extreme" role="alert">Could not load the guide.</p>}
      {!steps && !error && <PanelLoader label="Loading the guide" />}

      {steps && (
        <ol className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {steps.map((s, i) => (
            <li key={s.file} className="pw-card flex flex-col overflow-hidden rounded-[20px] border border-overlay/10 bg-canvas-raised">
              <div className="flex justify-center bg-overlay/[0.04] px-6 pt-5">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/docs/tour/${s.file}`} alt={`Tour step: ${s.title}`} loading="lazy" width={390} height={844}
                  className="h-auto w-full max-w-[230px] rounded-t-[22px] border border-b-0 border-overlay/10 shadow-themed" />
              </div>
              <div className="flex flex-1 flex-col gap-1.5 p-4">
                <p className="text-[12px] font-medium uppercase tracking-wide text-[#3478F6]">{s.step ? s.step.replace(/^Tour · /, "Step ") : i === 0 ? "Start" : "Finish"}</p>
                <h3 className="flex items-center gap-2 text-[17px] font-semibold leading-snug text-ink">
                  {s.title}
                  {s.tag && <span className={s.tag === "Required" ? "rounded-full bg-[#F2453D]/12 px-2 py-0.5 text-[11px] font-semibold text-[#F2453D]" : "rounded-full bg-overlay/10 px-2 py-0.5 text-[11px] font-semibold text-ink-muted"}>{s.tag}</span>}
                </h3>
                <p className="text-[15px] leading-snug text-ink-muted">{s.body}</p>
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
