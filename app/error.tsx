"use client";
import { useEffect } from "react";

/**
 * If something unexpected breaks while the app is open, this calm page shows instead of a blank screen: what
 * happened in plain words, and Try again (re-renders) or Reload (a fresh start). Nothing the person saved is lost.
 */
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error(error); }, [error]);
  return (
    <main className="flex min-h-[100dvh] items-center justify-center bg-canvas px-6">
      <div className="pw-notif w-full max-w-sm rounded-[24px] p-6 text-center shadow-themed">
        <h1 className="text-[20px] font-semibold text-ink">Something went wrong</h1>
        <p className="mt-2 text-[14px] leading-relaxed text-ink-muted">This screen hit an unexpected problem. Your tasks and habits are saved; try again, or reload the app.</p>
        <div className="mt-6 flex gap-3">
          <button type="button" onClick={() => window.location.reload()} className="h-11 flex-1 rounded-full bg-overlay/[0.08] text-[15px] font-medium text-ink active:scale-[0.98]">Reload</button>
          <button type="button" onClick={reset} className="h-11 flex-1 rounded-full bg-[#3478F6] text-[15px] font-semibold text-white active:scale-[0.98]">Try again</button>
        </div>
      </div>
    </main>
  );
}
