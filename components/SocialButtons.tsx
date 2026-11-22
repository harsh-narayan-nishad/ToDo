"use client";

import { useEffect, useRef } from "react";

const CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
const SCRIPT_SRC = "https://accounts.google.com/gsi/client";
const BTN = "flex h-12 w-full items-center justify-center gap-3 rounded-none border border-overlay/15 bg-white text-base font-medium text-[#1f1f1f] transition-colors  disabled:opacity-60";

interface GoogleId {
  initialize: (o: { client_id: string; callback: (r: { credential?: string }) => void }) => void;
  renderButton: (el: HTMLElement, o: Record<string, unknown>) => void;
}
declare global { interface Window { google?: { accounts: { id: GoogleId } } } }

/** Apple's official logo mark (as on Sign in with Apple buttons), in the button's text colour. */
function AppleMark() {
  return (
    <svg width="20" height="20" viewBox="0 0 814 1000" fill="currentColor" aria-hidden>
      <path d="M788.1 340.9c-5.8 4.5-108.2 62.2-108.2 190.5 0 148.4 130.3 200.9 134.2 202.2-.6 3.2-20.7 71.9-68.7 141.9-42.8 61.6-87.5 123.1-155.5 123.1s-85.5-39.5-164-39.5c-76.5 0-103.7 40.8-165.9 40.8s-105.6-57-155.5-127C46.7 790.7 0 663 0 541.8c0-194.4 126.4-297.5 250.8-297.5 66.1 0 121.2 43.4 162.7 43.4 39.5 0 101.1-46 176.3-46 28.5 0 130.9 2.6 198.3 99.2zm-234-181.5c31.1-36.9 53.1-88.1 53.1-139.3 0-7.1-.6-14.3-1.9-20.1-50.6 1.9-110.8 33.7-147.1 75.8-28.5 32.4-55.1 83.6-55.1 135.5 0 7.8 1.3 15.6 1.9 18.1 3.2.6 8.4 1.3 13.6 1.3 45.4 0 102.5-30.4 135.5-71.3z" />
    </svg>
  );
}

function GoogleMark() {
  return (
    <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden>
      <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.1C12.4 13.6 17.7 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.1 24.5c0-1.6-.1-3.1-.4-4.5H24v8.5h12.4c-.5 2.9-2.2 5.3-4.6 6.9l7.4 5.7c4.3-4 6.9-9.9 6.9-16.6z" />
      <path fill="#FBBC05" d="M10.5 28.7c-.5-1.4-.8-2.9-.8-4.7s.3-3.3.8-4.7l-7.9-6.1C.9 16.4 0 20.1 0 24s.9 7.6 2.6 10.8l7.9-6.1z" />
      <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.4-5.7c-2 1.4-4.7 2.3-8.5 2.3-6.3 0-11.6-4.1-13.5-9.8l-7.9 6.1C6.5 42.6 14.6 48 24 48z" />
    </svg>
  );
}

/** "Continue with Google" (works once NEXT_PUBLIC_GOOGLE_CLIENT_ID is set; any Pacewise account), "Continue with Apple" (not connected), then an "or" divider. */
export function SocialButtons({ onGoogleToken, onUnavailable, disabled }: { onGoogleToken: (idToken: string) => void; onUnavailable: (message: string) => void; disabled?: boolean }) {
  const slot = useRef<HTMLDivElement>(null);
  const handler = useRef(onGoogleToken);
  handler.current = onGoogleToken;

  useEffect(() => {
    if (!CLIENT_ID || !slot.current) return;
    const el = slot.current;
    const draw = () => {
      const id = window.google?.accounts.id;
      if (!id) return;
      id.initialize({ client_id: CLIENT_ID, callback: (r) => { if (r.credential) handler.current(r.credential); } });
      el.innerHTML = "";
      id.renderButton(el, { type: "standard", theme: "outline", size: "large", shape: "rectangular", text: "continue_with", logo_alignment: "center", width: Math.min(400, el.clientWidth || 384) });
    };
    if (window.google?.accounts) { draw(); return; }
    let script = document.querySelector<HTMLScriptElement>(`script[src="${SCRIPT_SRC}"]`);
    if (!script) {
      script = document.createElement("script");
      script.src = SCRIPT_SRC;
      script.async = true;
      script.defer = true;
      document.head.appendChild(script);
    }
    script.addEventListener("load", draw);
    return () => script?.removeEventListener("load", draw);
  }, []);

  return (
    <div className="mb-2 flex w-full flex-col gap-3">
      {CLIENT_ID ? (
        <div className={`flex h-12 w-full justify-center ${disabled ? "pointer-events-none opacity-60" : ""}`} ref={slot} aria-label="Continue with Google" />
      ) : (
        <button type="button" disabled={disabled} onClick={() => onUnavailable("Google sign-in is not set up yet.")} className={BTN}>
          <GoogleMark /> Continue with Google
        </button>
      )}
      <button type="button" disabled={disabled} onClick={() => onUnavailable("Apple sign-in is not available yet.")} className={BTN}>
        <AppleMark /> Continue with Apple
      </button>
      <div className="my-2 flex items-center gap-3 text-sm text-ink-muted" role="separator">
        <span className="h-px flex-1 bg-overlay/20" />
        or
        <span className="h-px flex-1 bg-overlay/20" />
      </div>
    </div>
  );
}
