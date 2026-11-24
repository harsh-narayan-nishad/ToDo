/**
 * The day's data kept on this device, so the app does not ask the server again every time a tab opens, the window
 * gets focus or the bell checks for reminders. A read is answered from the cache while it is from today and less
 * than 6 hours old; after that (or on a new day) the next read fetches it once again.
 *
 * Changes are still saved to the server straight away (one request each). The server's reply then updates the cached
 * copy in place (a task added, ticked, edited, deleted; a habit or check-in changed), so nothing is downloaded again
 * after an edit. Data the server works out itself (profile totals, history, logged time) is marked stale instead and
 * fetched once the next time it is shown.
 *
 * Kept in memory and in localStorage (per browser), and cleared on sign-in and sign-out.
 */
const STORE = "pacewise-todo-cache-v1";
export const CACHE_MS = 6 * 60 * 60 * 1000;

/** Reads that are cached: the signed-in account, tasks, habits and check-ins, profile, history, entries and the calendar. */
const CACHEABLE = [/^\/auth\/me$/, /^\/todo\/tasks$/, /^\/todo\/habits$/, /^\/todo\/habits\/entries$/, /^\/todo\/summary$/, /^\/todo\/logs$/, /^\/todo\/days\/[^/]+$/, /^\/todo\/entries$/, /^\/calendar\/events$/];
export const cacheable = (path: string) => CACHEABLE.some((r) => r.test(path));

interface Slot { at: number; day: string; data: string }
type Store = Record<string, Slot>;

const localDay = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

let mem: Store | null = null;
function store(): Store {
  if (mem) return mem;
  try { mem = JSON.parse(localStorage.getItem(STORE) ?? "{}") as Store; } catch { mem = {}; }
  return mem;
}
let saveTimer: ReturnType<typeof setTimeout> | null = null;
function persist() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    try { localStorage.setItem(STORE, JSON.stringify(store())); } catch { /* storage full or blocked: memory only */ }
  }, 50);
}

export const cacheKey = (path: string, query?: Record<string, unknown>) => {
  const q = Object.entries(query ?? {}).filter(([, v]) => v !== undefined && v !== "").sort(([a], [b]) => a.localeCompare(b));
  return q.length ? `${path}?${q.map(([k, v]) => `${k}=${String(v)}`).join("&")}` : path;
};

/** A fresh copy (today's, under 6 hours old), or undefined. */
export function cacheGet<T>(key: string): T | undefined {
  const s = store()[key];
  if (!s || s.day !== localDay() || Date.now() - s.at > CACHE_MS) return undefined;
  return JSON.parse(s.data) as T;
}
export function cachePut(key: string, data: unknown) {
  if (data === undefined) return;
  store()[key] = { at: Date.now(), day: localDay(), data: JSON.stringify(data) };
  persist();
}
export function cacheClear() {
  mem = {};
  try { localStorage.removeItem(STORE); } catch { /* storage blocked */ }
}
/** Marks reads stale (fetched again the next time they are needed). */
function drop(test: (key: string) => boolean) {
  const s = store();
  for (const k of Object.keys(s)) if (test(k)) delete s[k];
  persist();
}
/** Changes a cached list in place, keeping its age (so an edit never extends how long the copy is trusted). */
function edit<T>(test: (key: string) => boolean, fn: (list: T[], key: string) => T[]) {
  const s = store();
  for (const [k, slot] of Object.entries(s)) {
    if (!test(k)) continue;
    try {
      const list = JSON.parse(slot.data) as unknown;
      if (Array.isArray(list)) s[k] = { ...slot, data: JSON.stringify(fn(list as T[], k)) };
    } catch { delete s[k]; }
  }
  persist();
}

type WithId = { id: string };
const upsert = <T extends WithId>(list: T[], item: T, front = false) =>
  list.some((x) => x.id === item.id) ? list.map((x) => (x.id === item.id ? item : x)) : front ? [item, ...list] : [...list, item];
const pathOf = (k: string) => k.split("?")[0];
const queryOf = (k: string) => new URLSearchParams(k.split("?")[1] ?? "");
/** Server-computed reads that any To-do change can affect. */
const derived = (k: string) => /^\/todo\/(summary|logs|days\/|entries)/.test(k);

/** After a successful save: update the cached copies from the server's reply (or mark them stale). */
export function cacheAfterWrite(method: string, path: string, body: unknown, result: unknown) {
  const b = (body ?? {}) as Record<string, unknown>;
  let m: RegExpMatchArray | null;

  // ---- tasks (each is mirrored into the calendar by the server, so the calendar is read again next time) ----
  if (path.startsWith("/todo/tasks")) {
    const tasks = (k: string) => pathOf(k) === "/todo/tasks";
    if (method === "POST" && path === "/todo/tasks" && result) edit<WithId>(tasks, (l) => upsert(l, result as WithId, true));
    else if (method === "POST" && path === "/todo/tasks/bulk") {
      const created = ((result as { created?: WithId[] } | undefined)?.created ?? []);
      edit<WithId>(tasks, (l) => [...created, ...l.filter((x) => !created.some((c) => c.id === x.id))]);
    } else if ((m = path.match(/^\/todo\/tasks\/([^/]+)$/))) {
      const id = decodeURIComponent(m[1]);
      if (method === "PATCH" && result) edit<WithId>(tasks, (l) => upsert(l, result as WithId));
      else if (method === "DELETE") edit<WithId>(tasks, (l) => l.filter((x) => x.id !== id));
    } else if ((m = path.match(/^\/todo\/tasks\/([^/]+)\/logs$/)) && method === "POST") {
      const id = decodeURIComponent(m[1]);
      const minutes = Number(b.minutes) || 0;
      edit<WithId & { loggedMinutes?: number }>(tasks, (l) => l.map((x) => (x.id === id ? { ...x, loggedMinutes: (x.loggedMinutes ?? 0) + minutes } : x)));
    } else drop(tasks);
    drop((k) => derived(k) || pathOf(k) === "/calendar/events");
    return;
  }

  // ---- habits and check-ins ----
  if (path.startsWith("/todo/habits")) {
    const habits = (k: string) => pathOf(k) === "/todo/habits";
    const entries = (k: string) => pathOf(k) === "/todo/habits/entries";
    if (method === "POST" && path === "/todo/habits" && result) edit<WithId>(habits, (l) => upsert(l, result as WithId));
    else if ((m = path.match(/^\/todo\/habits\/([^/]+)$/))) {
      const id = decodeURIComponent(m[1]);
      if (method === "PATCH" && result) edit<WithId>(habits, (l) => upsert(l, result as WithId));
      else if (method === "DELETE") {
        edit<WithId>(habits, (l) => l.filter((x) => x.id !== id));
        edit<{ habitId: string }>(entries, (l) => l.filter((x) => x.habitId !== id));
      }
    } else if ((m = path.match(/^\/todo\/habits\/([^/]+)\/entries\/([^/]+)$/))) {
      const id = decodeURIComponent(m[1]);
      const day = m[2];
      const entry = method === "POST" ? (result as { habitId: string; day: string } | undefined) : undefined;
      edit<{ habitId: string; day: string }>(
        (k) => { if (!entries(k)) return false; const q = queryOf(k); return (q.get("from") ?? "") <= day && day <= (q.get("to") ?? "9999"); },
        (l) => [...l.filter((x) => !(x.habitId === id && x.day === day)), ...(entry ? [entry] : [])],
      );
    } else drop((k) => habits(k) || entries(k));
    drop(derived);
    return;
  }

  // ---- the calendar ----
  if (path.startsWith("/calendar/events")) {
    const events = (k: string) => pathOf(k) === "/calendar/events";
    if (method === "POST" && path === "/calendar/events" && result) edit<WithId>(events, (l) => upsert(l, result as WithId));
    else if ((m = path.match(/^\/calendar\/events\/([^/]+)$/)) && method === "PATCH" && result) edit<WithId>(events, (l) => upsert(l, result as WithId));
    else if (m && method === "DELETE") { const id = decodeURIComponent(m[1]); edit<WithId>(events, (l) => l.filter((x) => x.id !== id)); }
    else drop(events);
    // A new calendar entry can become a To-do task on the server: the task list is read again next time.
    drop((k) => derived(k) || pathOf(k) === "/todo/tasks");
    return;
  }

  // Gold coins (the wallet is never cached): buying Premium touches nothing else.
  if (path.startsWith("/todo/coins")) return;

  // Logged time removed, or anything else: whatever it touches is read again next time.
  if (path.startsWith("/todo/logs")) { drop((k) => derived(k) || pathOf(k) === "/todo/tasks" || pathOf(k) === "/calendar/events"); return; }
  if (path.startsWith("/todo") || path.startsWith("/calendar")) drop((k) => k.startsWith("/todo") || k.startsWith("/calendar"));
}
