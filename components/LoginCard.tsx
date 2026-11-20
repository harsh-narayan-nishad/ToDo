"use client";
import { useState } from "react";
import { Logo } from "@/components/Logo";
import { ApiError, googleLogin, login, logout, PACEWISE_URL, type User } from "@/lib/api";
import { Button } from "@/components/ui";
import { SocialButtons } from "@/components/SocialButtons";
import { PasswordInput } from "@/components/PasswordInput";
import { ButtonWheel } from "@/components/WheelSpinner";

const BOX = "block w-full rounded-none border border-overlay/25 bg-transparent px-4 py-4 text-base text-ink outline-none transition-colors placeholder:text-ink-muted focus:border-ink";

/** Same sign-in as Pacewise: the same e-mail/username and password (or Google) work here. */
export function LoginCard({ onSignedIn }: { onSignedIn: (u: User) => void }) {
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function run(signIn: () => Promise<User>) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      onSignedIn(await signIn());
    } catch (err) {
      await logout();
      setError(err instanceof ApiError ? err.message : "Could not sign in.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="grid h-screen w-full grid-rows-[minmax(0,1fr)] overflow-hidden lg:grid-cols-2">
      <div className="flex h-full min-h-0 flex-col overflow-y-auto px-6 py-10 sm:px-12 lg:px-[8vw]">
        <div className="my-auto">
          <Logo size="lg" className="mb-8" />
          <h1 className="mb-3 font-display text-5xl leading-[1.04] tracking-[-0.04em] text-ink sm:text-6xl xl:text-7xl">Plan it. Do it.</h1>
          <p className="mb-10 max-w-sm text-ink-muted">Sign in with your Pacewise account. Your tasks appear in your Pacewise calendar.</p>
          <div className="w-full max-w-sm">
            <SocialButtons disabled={busy} onGoogleToken={(t) => void run(() => googleLogin(t))} onUnavailable={setError} />
            <form onSubmit={(e) => { e.preventDefault(); void run(() => login(identifier.trim(), password)); }} className="flex flex-col gap-4">
              <label className="block">
                <span className="sr-only">Email or username</span>
                <input value={identifier} onChange={(e) => setIdentifier(e.target.value)} placeholder="Email or username" autoComplete="username" required className={BOX} />
              </label>
              <label className="block">
                <span className="sr-only">Password</span>
                <PasswordInput value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" autoComplete="current-password" required className={BOX} />
              </label>
              {error && <p className="text-sm text-accent-extreme" role="alert">{error}</p>}
              <Button type="submit" size="lg" disabled={busy} className="mt-1 h-14 w-full text-base">{busy && <ButtonWheel />}{busy ? "Please wait…" : "Sign in"}</Button>
            </form>
            <p className="mt-6 text-sm text-ink-muted">
              No account yet? <a href={PACEWISE_URL} target="_blank" rel="noopener noreferrer" className="text-ink underline underline-offset-4 hover:text-accent-medium">Create one in Pacewise</a>.
            </p>
          </div>
        </div>
      </div>
      <div aria-hidden className="hidden h-full items-center justify-center overflow-hidden lg:flex">
        <svg viewBox="0 0 420 520" className="h-[78vh] w-auto text-ink">
          <text x="210" y="470" textAnchor="middle" fontSize="640" fontWeight="700" fill="none" stroke="currentColor" strokeOpacity="0.28" strokeWidth="2" style={{ fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif" }}>P</text>
        </svg>
      </div>
    </main>
  );
}
