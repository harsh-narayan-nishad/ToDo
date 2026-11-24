"use client";
import { useEffect, useState } from "react";
import { PanelLoader } from "@/components/WheelSpinner";
import { ChevronDown, Crown, Flame } from "lucide-react";
import { Card, Stat } from "@/components/ui";
import { GoldCoin } from "@/components/GoldCoin";
import { ButtonWheel } from "@/components/WheelSpinner";
import { coinsApi, isPremium, useWallet, type CoinTxn, type Wallet } from "@/lib/coins";
import { Heatmap } from "@/components/Heatmap";
import type { User } from "@/lib/api";
import { dayLabel, duration, longDay } from "@/lib/days";
import { todoApi, type HeatDay, type Summary } from "@/lib/todo";
import { cn } from "@/lib/utils";

/** Totals and hours worked, all from the server. */
export function ProfilePanel({ user, version, onOpenDay }: { user: User; version: number; onOpenDay: (day: string) => void }) {
  const [data, setData] = useState<Summary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const coins = useWallet(version);

  useEffect(() => {
    todoApi.summary().then((s) => { setData(s); setError(null); }, (e) => setError(e instanceof Error ? e.message : "Could not load your profile."));
  }, [version]);

  if (error) return <p className="text-sm text-accent-extreme" role="alert">{error}</p>;
  // The profile appears in one go, with its gold coins: never the stats first and the coins a moment later.
  if (!data || (!coins.wallet && !coins.error)) return <PanelLoader label="Loading your profile" />;
  const { totals: t } = data;

  return (
    <div className="flex flex-col gap-8">
      <Card className="pw-card flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          {user.avatarUrl ? <img src={user.avatarUrl} alt="" className="h-14 w-14 object-cover" /> : (
            <span className="flex h-14 w-14 items-center justify-center bg-overlay/10 font-display text-2xl">{user.name.slice(0, 1).toUpperCase()}</span>
          )}
          <div>
            <p className="text-xl text-ink">{user.name}</p>
            <p className="text-sm text-ink-muted">@{user.username}</p>
          </div>
        </div>
        {/* Gold coins (the server's wallet) and Premium. */}
        {coins.wallet && (
          <div className="flex flex-wrap items-center gap-2 self-start sm:self-center">
            {isPremium(coins.wallet) && <PremiumBadge />}
            <div className="pw-coin flex items-center gap-3 rounded-full py-1.5 pl-1.5 pr-4" title={`${coins.wallet.rules.perTask} gold coins for every finished task`}>
              <GoldCoin size={34} />
              <span>
                <span className="block pw-coin-value text-xl font-semibold tabular-nums leading-tight">{coins.wallet.balance.toLocaleString()}</span>
                <span className="block pw-coin-note text-[11px] leading-tight">gold coins</span>
              </span>
            </div>
          </div>
        )}
      </Card>

      {coins.wallet ? <CoinsCard wallet={coins.wallet} onWallet={coins.setWallet} /> : coins.error && <p className="text-sm text-accent-extreme" role="alert">{coins.error}</p>}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat className="pw-card" label="Tasks created" value={t.created} />
        <Stat className="pw-card" label="Tasks finished" value={t.completed} tone="green" hint={t.created ? `${Math.round((t.completed / t.created) * 100)}% of created` : undefined} />
        <Stat className="pw-card" label="Open" value={t.open} hint={t.overdue ? `${t.overdue} overdue` : "none overdue"} tone={t.overdue ? "red" : undefined} />
        <Stat className="pw-card" label="Hours worked" value={`${t.hours} h`} tone="blue" hint={t.workedDays ? `about ${duration(t.avgMinutesPerWorkedDay)} per working day` : "log time on a task"} />
      </div>

      <WeekChart days={data.heatmap.slice(-7)} onOpenDay={onOpenDay} />

      <Heatmap days={data.heatmap} summary={data} onOpenDay={onOpenDay} />
    </div>
  );
}

/** "9h 11m", "45m", "0m" (the compact form). */
const hm = (m: number) => (m >= 60 ? `${Math.floor(m / 60)}h${m % 60 ? ` ${m % 60}m` : ""}` : `${m}m`);
const WEEKDAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/**
 * The last 7 days as a bar chart of one measure at a time, picked in the switch on the right: Time worked (the
 * scale reads 1h / 30m / 0) or Tasks finished (the scale reads counts), so the bars, the numbers above them and the
 * scale always mean the same thing. One bar per day on a faint full-height track, a dashed daily-average line,
 * today picked out, a hover card with the day's numbers, and a legend underneath. Click a day to open it.
 */
function WeekChart({ days, onOpenDay }: { days: HeatDay[]; onOpenDay: (day: string) => void }) {
  const [hovered, setHovered] = useState<{ d: HeatDay; x: number; y: number } | null>(null);
  const total = days.reduce((a, d) => a + d.minutes, 0);
  const finished = days.reduce((a, d) => a + d.completed, 0);
  const added = days.reduce((a, d) => a + d.created, 0);
  const best = days.reduce<HeatDay | null>((b, d) => (d.minutes > (b?.minutes ?? 0) ? d : b), null);
  // Opens on time worked, or on tasks finished when no time was logged this week.
  const [measure, setMeasure] = useState<"time" | "tasks">(() => (total === 0 && finished > 0 ? "tasks" : "time"));
  const time = measure === "time";
  const value = (d: HeatDay) => (time ? d.minutes : d.completed);
  const fmt = (v: number) => (time ? hm(v) : `${v} ${v === 1 ? "task" : "tasks"}`);
  // A round top for the scale: time up to the next half hour (at least an hour); tasks up to the next even count (at least 2).
  const peak = Math.max(0, ...days.map(value));
  const top = time ? Math.max(60, Math.ceil(peak / 30) * 30) : Math.max(2, Math.ceil(peak / 2) * 2);
  const sum = time ? total : finished;
  const avg = days.length ? sum / days.length : 0;
  const label = (d: HeatDay) => { const l = dayLabel(d.day); return l === "Today" ? "Today" : WEEKDAY[new Date(d.day + "T12:00").getDay()]; };
  const isToday = (d: HeatDay) => dayLabel(d.day) === "Today";
  const barColor = time ? "bg-accent-slow" : "bg-[#5ED3D3]";

  return (
    <Card className="pw-card">
      <div className="mb-1 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2"><Flame className="h-4 w-4 text-accent-fast" /><h2 className="text-sm uppercase tracking-wide text-ink-muted">Last 7 days</h2></div>
        {/* the measure the bars show */}
        <div className="flex shrink-0 rounded-full bg-overlay/[0.07] p-0.5 text-xs" role="group" aria-label="Bars show">
          {([["time", "Time"], ["tasks", "Tasks"]] as const).map(([id, name]) => (
            <button key={id} type="button" aria-pressed={measure === id} onClick={() => setMeasure(id)}
              className={cn("rounded-full px-3 py-1 transition-colors", measure === id ? "bg-canvas-raised text-ink shadow-themed" : "text-ink-muted")}>{name}</button>
          ))}
        </div>
      </div>
      <p className="font-display text-3xl text-ink">{time ? hm(total) : `${finished} ${finished === 1 ? "task" : "tasks"}`}</p>
      <p className="mb-4 mt-0.5 text-xs text-ink-faint">
        {sum ? `Daily average ${time ? hm(Math.round(avg)) : (Math.round(avg * 10) / 10).toString()}${time ? "" : " finished"}` : time ? "Log time on a task to fill the bars" : "Finish a task to fill the bars"}
      </p>

      {/* what the bars and the scale measure, and what the dashed line is */}
      <div className="mb-5 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-xs text-ink-muted">
        <span className="flex items-center gap-1.5"><span className={cn("h-2.5 w-2.5 shrink-0 rounded-[3px]", barColor)} aria-hidden />{time ? "Time worked per day (hours and minutes)" : "Tasks finished per day (number of tasks)"}</span>
        {avg > 0 && <span className="flex items-center gap-1.5"><span className={cn("w-4 border-t border-dashed", time ? "border-accent-slow" : "border-[#5ED3D3]")} aria-hidden />Daily average</span>}
      </div>
      <div className="flex gap-3">
        <div className="relative h-40 flex-1">
          {/* gridlines: top, middle, zero */}
          {[0, 0.5, 1].map((f) => <span key={f} className={cn("pointer-events-none absolute inset-x-0 border-t", f === 1 ? "border-overlay/25" : "border-overlay/10")} style={{ top: `${f * 100}%` }} aria-hidden />)}
          {/* the daily average, dashed */}
          {avg > 0 && <span className={cn("pointer-events-none absolute inset-x-0 z-10 border-t border-dashed", time ? "border-accent-slow/70" : "border-[#5ED3D3]/80")} style={{ bottom: `${(avg / top) * 100}%` }} aria-hidden />}
          <div className="absolute inset-0 flex">
            {days.map((d, i) => {
              const v = value(d);
              const show = (el: HTMLElement) => { const r = el.getBoundingClientRect(); setHovered({ d, x: r.left + r.width / 2, y: r.top }); };
              return (
                <button key={d.day} type="button" onClick={() => onOpenDay(d.day)}
                  aria-label={`${longDay(d.day)}: ${duration(d.minutes)} worked, ${d.completed} finished, ${d.created} added`}
                  onMouseEnter={(e) => show(e.currentTarget)} onMouseLeave={() => setHovered(null)} onFocus={(e) => show(e.currentTarget)} onBlur={() => setHovered(null)}
                  className={cn("relative flex h-full min-w-0 flex-1 items-end justify-center outline-none transition-colors hover:bg-overlay/[0.035] focus-visible:bg-overlay/[0.05]",
                    i > 0 && "border-l border-dashed border-overlay/10", isToday(d) && "bg-overlay/[0.03]")}>
                  {/* the track, and the bar in it with its value above */}
                  <div className="relative h-full w-[58%] max-w-[28px] rounded-t-[6px] bg-overlay/[0.05]">
                    <div className={cn("absolute inset-x-0 bottom-0 rounded-t-[6px] transition-[height] duration-500", barColor)}
                      style={{ height: `${(v / top) * 100}%`, minHeight: v > 0 ? 3 : 0 }}>
                      {v > 0 && <span className="absolute left-1/2 -top-4 -translate-x-1/2 whitespace-nowrap text-[10px] font-medium tabular-nums leading-none text-ink-muted">{fmt(v)}</span>}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
        {/* the scale on the right, in the measure shown */}
        <div className="relative h-40 w-14 shrink-0 whitespace-nowrap text-xs tabular-nums text-ink-faint" aria-hidden>
          <span className="absolute left-0 top-0 -translate-y-1/2">{fmt(top)}</span>
          <span className="absolute left-0 top-1/2 -translate-y-1/2">{fmt(top / 2)}</span>
          <span className="absolute bottom-0 left-0 translate-y-1/2">0</span>
        </div>
      </div>
      <div className="mr-[4.25rem] mt-2 flex">
        {days.map((d) => <span key={d.day} className={cn("min-w-0 flex-1 truncate text-center text-[10px] sm:text-xs", isToday(d) ? "font-semibold text-ink" : "text-ink-muted")}>
          {/* phones: the weekday (today in bold); wider screens: "Today" */}
          <span className="sm:hidden">{WEEKDAY[new Date(d.day + "T12:00").getDay()]}</span><span className="hidden sm:inline">{label(d)}</span>
        </span>)}
      </div>

      <div className="mt-5 grid grid-cols-3 gap-3 border-t border-overlay/10 pt-4 text-sm">
        <div><p className="flex items-center gap-1.5 text-accent-slow"><span className="h-2 w-2 shrink-0 rounded-full bg-accent-slow" aria-hidden />Time worked</p><p className="mt-0.5 text-ink">{hm(total)}</p></div>
        <div><p className="flex items-center gap-1.5 text-[#5ED3D3]"><span className="h-2 w-2 shrink-0 rounded-full bg-[#5ED3D3]" aria-hidden />Tasks finished</p><p className="mt-0.5 text-ink">{finished}{added ? <span className="text-ink-faint"> of {added} added</span> : null}</p></div>
        <div><p className="text-accent-fast">Best day</p><p className="mt-0.5 text-ink">{best ? `${label(best)} · ${hm(best.minutes)}` : "–"}</p></div>
      </div>

      {hovered && (
        <div role="tooltip" className="pointer-events-none fixed z-50 -translate-x-1/2 -translate-y-full rounded-2xl border border-overlay/10 bg-canvas-raised px-3.5 py-2.5 text-[13px] leading-snug text-ink shadow-themed"
          style={{ left: hovered.x, top: hovered.y - 8 }}>
          <div className="mb-1 font-display text-base tracking-[-0.02em] text-ink">{longDay(hovered.d.day)}</div>
          <div className="flex items-center gap-1.5 text-ink-muted"><span className="h-2 w-2 rounded-full bg-accent-slow" aria-hidden />Time worked: {duration(hovered.d.minutes)}</div>
          <div className="flex items-center gap-1.5 text-ink-muted"><span className="h-2 w-2 rounded-full bg-[#5ED3D3]" aria-hidden />Tasks finished: {hovered.d.completed}</div>
          <div className="pl-3.5 text-ink-muted">Tasks added: {hovered.d.created}</div>
        </div>
      )}
    </Card>
  );
}

/** The gold Premium badge. */
function PremiumBadge() {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-b from-[#F7C531] to-[#D99A0B] px-3 py-1.5 text-[13px] font-semibold text-[#3A2600] shadow-[0_1px_6px_rgba(217,154,11,0.35)]">
      <Crown className="h-3.5 w-3.5" strokeWidth={2.4} aria-hidden />Premium
    </span>
  );
}

const TXN_LABEL: Record<CoinTxn["kind"], string> = { welcome: "Welcome bonus", earn: "Task finished", revoke: "Task reopened", premium: "Premium" };

/**
 * The wallet, like a game's: the balance, today's coins against the daily limit, Premium (buy or extend it with
 * coins, after a confirm), and the latest coins in and out. Every number comes from the server.
 */
function CoinsCard({ wallet: w, onWallet }: { wallet: Wallet; onWallet: (w: Wallet) => void }) {
  const [confirm, setConfirm] = useState(false);
  /** Compact (balance and Premium) until More is tapped. */
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const r = w.rules;
  const premium = isPremium(w);
  const short = Math.max(0, r.premiumPrice - w.balance);

  async function buy() {
    setBusy(true);
    setError(null);
    try { onWallet(await coinsApi.buyPremium()); setConfirm(false); } catch (e) { setError(e instanceof Error ? e.message : "Could not buy Premium."); } finally { setBusy(false); }
  }

  return (
    <Card className="pw-card flex flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-sm uppercase tracking-wide text-ink-muted">Gold coins</h2>
          <p className="mt-1 flex items-center gap-2 font-display text-4xl tabular-nums text-ink"><GoldCoin size={30} />{w.balance.toLocaleString()}</p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-controls="coins-more"
            className="inline-flex h-9 items-center gap-1 rounded-full bg-overlay/[0.07] pl-3.5 pr-2.5 text-[13px] font-medium text-ink transition-colors active:bg-overlay/[0.12]">
            {open ? "Less" : "More"}<ChevronDown className={cn("h-4 w-4 transition-transform duration-200", open && "rotate-180")} aria-hidden />
          </button>
        </div>
      </div>

      {open && (
      <div id="coins-more" className="fade-in flex flex-col gap-5">
      <p className="-mt-3 text-xs text-ink-faint">{r.perTask} coins for every finished task · up to {r.dailyCap} a day · reopening a task takes its coins back</p>

      {/* Today's coins against the daily limit. */}
      <div>
        <div className="mb-1.5 flex justify-between text-xs text-ink-muted"><span>Earned today</span><span className="tabular-nums">{w.earnedToday} / {r.dailyCap}</span></div>
        <div className="h-2 overflow-hidden rounded-full bg-overlay/10">
          <div className="h-full rounded-full bg-gradient-to-r from-[#FFE680] to-[#D99A0B] transition-[width] duration-500" style={{ width: `${Math.min(100, (w.earnedToday / r.dailyCap) * 100)}%` }} />
        </div>
      </div>

      {/* Premium, bought with coins. */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-overlay/[0.04] p-4">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-ink"><Crown className="h-4 w-4 text-[#D99A0B]" aria-hidden />{premium ? "Extend Premium" : "Get Premium"}</p>
          <p className="mt-0.5 text-xs text-ink-muted">
            {r.premiumDays} days for {r.premiumPrice.toLocaleString()} coins{premium ? ", added after your current days" : ""}.{short > 0 ? ` ${short.toLocaleString()} more to go.` : ""}
          </p>
        </div>
        {!confirm ? (
          <button type="button" disabled={short > 0} onClick={() => { setConfirm(true); setError(null); }}
            className="inline-flex h-10 items-center gap-2 rounded-full bg-gradient-to-b from-[#F7C531] to-[#D99A0B] px-5 text-sm font-semibold text-[#3A2600] transition-transform active:scale-[0.97] disabled:opacity-40">
            <GoldCoin size={18} />{r.premiumPrice.toLocaleString()}
          </button>
        ) : (
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setConfirm(false)} disabled={busy} className="h-10 rounded-full bg-overlay/[0.08] px-4 text-sm text-ink disabled:opacity-40">Cancel</button>
            <button type="button" onClick={() => void buy()} disabled={busy} aria-busy={busy}
              className="inline-flex h-10 items-center gap-2 rounded-full bg-gradient-to-b from-[#F7C531] to-[#D99A0B] px-5 text-sm font-semibold text-[#3A2600] transition-transform active:scale-[0.97] disabled:opacity-80">
              {busy ? <ButtonWheel /> : <GoldCoin size={18} />}{busy ? "Buying…" : `Spend ${r.premiumPrice.toLocaleString()}`}
            </button>
          </div>
        )}
        {error && <p className="w-full text-sm text-accent-extreme" role="alert">{error}</p>}
      </div>

      {/* The latest coins in and out. */}
      {w.history.length > 0 && (
        <div>
          <h3 className="mb-2 text-xs uppercase tracking-wide text-ink-muted">History</h3>
          <ul className="flex flex-col divide-y divide-overlay/10">
            {w.history.slice(0, 8).map((x) => (
              <li key={x.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                <span className="min-w-0">
                  <span className="block truncate text-ink">{x.kind === "welcome" || x.kind === "premium" ? x.note || TXN_LABEL[x.kind] : TXN_LABEL[x.kind]}</span>
                  <span className="block text-xs text-ink-faint">{dayLabel(x.day)}</span>
                </span>
                <span className={cn("shrink-0 font-semibold tabular-nums", x.amount > 0 ? "text-[#D99A0B]" : "text-ink-muted")}>{x.amount > 0 ? "+" : "−"}{Math.abs(x.amount).toLocaleString()}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      </div>
      )}
    </Card>
  );
}
