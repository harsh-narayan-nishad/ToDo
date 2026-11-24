"use client";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { tzOffset } from "@/lib/days";

/**
 * Gold coins, the app's token, kept by the server (backend modules/todo/coins.*): earned for every finished task (up to
 * a daily limit), taken back if a task is reopened, and spent on Premium. This device only shows the wallet; it can
 * never change a balance itself.
 */
export type CoinKind = "welcome" | "earn" | "revoke" | "premium";
export interface CoinTxn { id: string; kind: CoinKind; amount: number; day: string; note: string; at: string }
export interface Wallet {
  balance: number;
  premium: boolean;
  /** ISO time Premium runs until (null: never bought). */
  premiumUntil: string | null;
  earnedToday: number;
  rules: { perTask: number; dailyCap: number; premiumPrice: number; premiumDays: number };
  history: CoinTxn[];
}

export const coinsApi = {
  wallet: () => api<Wallet>("/todo/coins", { query: { tzOffset: tzOffset() } }),
  buyPremium: () => api<Wallet>("/todo/coins/premium", { method: "POST", body: { tzOffset: tzOffset() } }),
};

/** Premium is on: the switch future Premium features check. */
export const isPremium = (w: Wallet | null | undefined) => !!w?.premium && !!w.premiumUntil && new Date(w.premiumUntil).getTime() > Date.now();

/** The wallet, loaded again whenever `version` changes (after a task is finished or reopened). */
export function useWallet(version: number) {
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [error, setError] = useState<string | null>(null);
  const reload = useCallback(async () => {
    try { setWallet(await coinsApi.wallet()); setError(null); } catch (e) { setError(e instanceof Error ? e.message : "Could not load your coins."); }
  }, []);
  useEffect(() => { void reload(); }, [reload, version]);
  return { wallet, setWallet, error, reload };
}
