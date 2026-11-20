/**
 * Which backend this app talks to: the LOCAL one when it is running, otherwise the ONLINE one.
 *
 * On this computer (localhost) the local backend's health check is asked once per page load:
 *  - it answers → every call goes to the local backend;
 *  - no answer  → every call goes to the online backend.
 * If the local backend stops while the page is open, the next call that cannot connect switches to online.
 * Deployed (any other host), the online backend is used — unless NEXT_PUBLIC_API_URL names a non-localhost address.
 *
 * NEXT_PUBLIC_API_URL        = the local backend   (default http://localhost:4000/api/v1)
 * NEXT_PUBLIC_API_URL_ONLINE = the online backend  (default: the Pacewise backend on Render)
 */
const clean = (u: string) => u.replace(/\/+$/, "");
export const LOCAL_API = clean(process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api/v1");
export const ONLINE_API = clean(process.env.NEXT_PUBLIC_API_URL_ONLINE || "https://pacewise-backend-o4qu.onrender.com/api/v1");
const PROBE_MS = 1500;

/** The backend in use right now (decided by whenBackendChosen). */
export let API_BASE = LOCAL_API;

const isLocalUrl = (u: string) => /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:|\/|$)/.test(u);
/** Deployed: a localhost backend is unreachable, so use the online one unless a real address was configured. */
const DEPLOYED_API = isLocalUrl(LOCAL_API) ? ONLINE_API : LOCAL_API;

const onThisComputer = () => typeof window !== "undefined" && ["localhost", "127.0.0.1", "[::1]"].includes(window.location.hostname);

async function localIsUp(): Promise<boolean> {
  try {
    const res = await fetch(`${LOCAL_API}/health`, { cache: "no-store", signal: AbortSignal.timeout(PROBE_MS) });
    return res.ok && (await res.json())?.status === "ok";
  } catch {
    return false;
  }
}

let choice: Promise<string> | null = null;
export function whenBackendChosen(): Promise<string> {
  choice ??= (async () => {
    API_BASE = !onThisComputer() ? DEPLOYED_API : (await localIsUp()) ? LOCAL_API : ONLINE_API;
    return API_BASE;
  })();
  return choice;
}

/** After a call to the local backend could not connect: use the online one from now on. True if a retry makes sense. */
export function fallBackToOnline(): boolean {
  if (API_BASE === ONLINE_API || !onThisComputer()) return false;
  API_BASE = ONLINE_API;
  choice = Promise.resolve(ONLINE_API);
  return true;
}

export const backendLabel = (base = API_BASE) => (base === ONLINE_API ? "online" : "local");
