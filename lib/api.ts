import { API_BASE, fallBackToOnline, whenBackendChosen } from "@/lib/backend";
import { cacheAfterRead, cacheAfterWrite, cacheClear, cacheGet, cacheKey, cachePut, cacheable } from "@/lib/cache";
/** Backend address INCLUDING /api/v1: the local backend when it runs, otherwise the online one (see lib/backend.ts). */
export { API_BASE };
/** The main Pacewise app, for "Open calendar" and "Create an account". */
export const PACEWISE_URL = (process.env.NEXT_PUBLIC_PACEWISE_URL ?? "http://localhost:3000").replace(/\/+$/, "");

export class ApiError extends Error {
  constructor(public status: number, message: string, public code?: string) {
    super(message);
  }
}

const KEY = "pacewise-todo-session";
interface Session { accessToken: string; refreshToken: string }

export const session = {
  get(): Session | null {
    try { return JSON.parse(localStorage.getItem(KEY) ?? "null") as Session | null; } catch { return null; }
  },
  set(s: Session) { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* storage blocked */ } },
  clear() { try { localStorage.removeItem(KEY); } catch { /* storage blocked */ } },
};

type Query = Record<string, string | number | boolean | undefined>;
interface Options { method?: "GET" | "POST" | "PATCH" | "DELETE"; body?: unknown; query?: Query; noAuth?: boolean }

function url(path: string, query?: Query): string {
  const u = new URL(API_BASE + path);
  for (const [k, v] of Object.entries(query ?? {})) if (v !== undefined && v !== "") u.searchParams.set(k, String(v));
  return u.toString();
}

let refreshing: Promise<boolean> | null = null;
/** One shared refresh, so several requests failing at once do not each rotate (and invalidate) the refresh token. */
function refreshSession(): Promise<boolean> {
  const s = session.get();
  if (!s) return Promise.resolve(false);
  refreshing ??= fetch(url("/auth/refresh"), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ refreshToken: s.refreshToken }) })
    .then(async (r) => {
      if (!r.ok) { session.clear(); cacheClear(); return false; }
      const j = (await r.json()) as Session;
      session.set({ accessToken: j.accessToken, refreshToken: j.refreshToken });
      return true;
    })
    .catch(() => false)
    .finally(() => { refreshing = null; });
  return refreshing;
}

/**
 * A request to the backend. Reads of the day's data come from this device's cache while it is fresh (see lib/cache.ts),
 * so opening tabs or coming back to the app sends nothing; saves go to the server at once and update the cache.
 */
const inflight = new Map<string, Promise<unknown>>();
export async function api<T>(path: string, opts: Options = {}): Promise<T> {
  const method = opts.method ?? "GET";
  if (method === "GET" && !opts.noAuth && cacheable(path)) {
    const key = cacheKey(path, opts.query);
    const hit = cacheGet<T>(key);
    if (hit !== undefined) return hit;
    // The same read asked for twice at once (two panels) goes out once.
    const running = inflight.get(key) as Promise<T> | undefined;
    if (running) return running;
    const p = request<T>(path, opts).then((data) => { cachePut(key, cacheAfterRead(path, data)); return data; }).finally(() => inflight.delete(key));
    inflight.set(key, p);
    return p;
  }
  const data = await request<T>(path, opts);
  if (method !== "GET" && !opts.noAuth) cacheAfterWrite(method, path, opts.body, data);
  return data;
}

async function request<T>(path: string, opts: Options = {}, retried = false): Promise<T> {
  if (!API_BASE) throw new ApiError(0, "NEXT_PUBLIC_API_URL is not set. Copy .env.local.example to .env.local and restart.", "API_DISABLED");
  await whenBackendChosen();
  const headers: Record<string, string> = {};
  if (opts.body !== undefined) headers["Content-Type"] = "application/json";
  const s = session.get();
  if (!opts.noAuth && s) headers.Authorization = `Bearer ${s.accessToken}`;
  let res: Response;
  try {
    res = await fetch(url(path, opts.query), { method: opts.method ?? "GET", headers, body: opts.body === undefined ? undefined : JSON.stringify(opts.body) });
  } catch {
    // The local backend was stopped while this page was open: carry on with the online one.
    if (fallBackToOnline()) return request<T>(path, opts, retried);
    // A CORS refusal looks exactly like this in the browser, so name both causes.
    throw new ApiError(0, `Cannot reach the backend at ${API_BASE}. Check that it is running and that its CORS_ORIGINS includes ${typeof window === "undefined" ? "this app" : window.location.origin}.`, "NETWORK");
  }
  if (res.status === 401 && !opts.noAuth && !retried && (await refreshSession())) return request<T>(path, opts, true);
  if (res.status === 204) return undefined as T;
  const data = (await res.json().catch(() => ({}))) as { message?: string; error?: { message?: string; code?: string }; code?: string };
  if (!res.ok) throw new ApiError(res.status, data.error?.message ?? data.message ?? `Request failed (${res.status})`, data.error?.code ?? data.code);
  return data as T;
}

export interface User { id: string; name: string; username: string; email: string; avatarUrl?: string | null }
interface LoginResult { user: User; accessToken?: string; refreshToken?: string; approvalRequired?: boolean; verificationRequired?: boolean }

/** Sign-ins use the normal Pacewise endpoints: one account for both apps. */
function keep(r: LoginResult): User {
  if (!r.accessToken || !r.refreshToken) {
    throw new ApiError(403, r.approvalRequired ? "Your account is waiting for approval." : "Please confirm your e-mail in Pacewise first.", "NOT_READY");
  }
  session.set({ accessToken: r.accessToken, refreshToken: r.refreshToken });
  cacheClear(); // a new sign-in never sees an earlier account's data
  return r.user;
}

export async function login(identifier: string, password: string): Promise<User> {
  return keep(await api<LoginResult>("/auth/login", { method: "POST", body: { identifier, password, device: "todo" }, noAuth: true }));
}

export async function googleLogin(idToken: string): Promise<User> {
  return keep(await api<LoginResult>("/auth/google", { method: "POST", body: { idToken, device: "todo" }, noAuth: true }));
}

export async function logout(): Promise<void> {
  const s = session.get();
  session.clear();
  cacheClear();
  if (s && API_BASE) await fetch(url("/auth/logout"), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ refreshToken: s.refreshToken }) }).catch(() => undefined);
}
