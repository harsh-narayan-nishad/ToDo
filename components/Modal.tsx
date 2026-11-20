"use client";
import { useEffect } from "react";

/** Centered popup in the same style as the admin app's confirmation dialog. Escape or a click outside closes it. */
export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 px-4" role="dialog" aria-modal="true" aria-label={title} onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-none border border-overlay/10 bg-canvas-raised p-6 shadow-themed sm:p-8">
        <h2 className="mb-5 font-display text-2xl">{title}</h2>
        {children}
      </div>
    </div>
  );
}
