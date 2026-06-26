"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { supabase } from "./supabase";
import { monthRange } from "./format";
import type { Txn, Category, Account } from "./types";
import type { Asset, AssetValuation, PatrimoineLine } from "./patrimoine";
import type { Goal } from "./goals";
import { getUserSettings } from "./user-settings-api";
import { coerceSettings, DEFAULT_SETTINGS, type UserSettings } from "./settings";
import type { MonthlyCategoryRow } from "./categories-analysis";
import type { Recurring } from "./fixed";
import type { Reminder } from "./reminders";
import { ensureSeed } from "./seed";

export type AuthUser = { id: string; email?: string };

export const AuthContext = createContext<AuthUser | null>(null);

export function useAuth(): AuthUser {
  const user = useContext(AuthContext);
  if (!user) throw new Error("useAuth must be used within AuthContext.Provider");
  return user;
}

export function useSession() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUser((data.user as AuthUser) ?? null);
      setReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) =>
      setUser((s?.user as AuthUser) ?? null)
    );
    return () => sub.subscription.unsubscribe();
  }, []);

  return { user, ready };
}

export function useTransactions(month: string) {
  const [txns, setTxns] = useState<Txn[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(() => {
    const { start, next } = monthRange(month);
    setLoading(true);
    supabase
      .from("transactions")
      .select("*")
      .gte("date", start)
      .lt("date", next)
      .order("date", { ascending: false })
      .then(({ data, error }) => {
        if (error) {
          setError(error.message);
        } else {
          setError(null);
          setTxns((data as Txn[]) ?? []);
        }
        setLoading(false);
      });
  }, [month]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { txns, loading, error, refetch };
}

export function useCategories() {
  const [categories, setCategories] = useState<Category[]>([]);
  const refetch = useCallback(() => {
    supabase
      .from("categories")
      .select("id,name,type,color,monthly_budget")
      .order("name")
      .then(({ data }) => setCategories((data as Category[]) ?? []));
  }, []);
  useEffect(() => {
    refetch();
  }, [refetch]);
  return { categories, refetch };
}

export function useAccounts() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  useEffect(() => {
    supabase
      .from("accounts")
      .select("id,name")
      .order("name")
      .then(({ data }) => setAccounts((data as Account[]) ?? []));
  }, []);
  return { accounts };
}

export function useAssets() {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(() => {
    setLoading(true);
    supabase
      .from("assets")
      .select("id,account_id,name,type,current_value,ticker,quantity")
      .order("name")
      .then(({ data, error }) => {
        if (error) setError(error.message);
        else {
          setError(null);
          setAssets((data as Asset[]) ?? []);
        }
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { assets, loading, error, refetch };
}

export function useAssetValuations() {
  const [valuations, setValuations] = useState<AssetValuation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(() => {
    setLoading(true);
    supabase
      .from("asset_valuations")
      .select("id,asset_id,date,value")
      .order("date", { ascending: true })
      .then(({ data, error }) => {
        if (error) setError(error.message);
        else {
          setError(null);
          setValuations((data as AssetValuation[]) ?? []);
        }
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { valuations, loading, error, refetch };
}

export function usePatrimoineSummary(userId: string) {
  const [lines, setLines] = useState<PatrimoineLine[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(() => {
    setLoading(true);
    supabase
      .from("v_patrimoine")
      .select("type,n_assets,total_value")
      .eq("user_id", userId)
      .then(({ data, error }) => {
        if (error) setError(error.message);
        else {
          setError(null);
          setLines((data as PatrimoineLine[]) ?? []);
        }
        setLoading(false);
      });
  }, [userId]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { lines, loading, error, refetch };
}

export function useAllTransactions() {
  const [txns, setTxns] = useState<Txn[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabase
      .from("transactions")
      .select("id,date,amount,type")
      .then(({ data, error }) => {
        if (error) setError(error.message);
        else {
          setError(null);
          setTxns((data as Txn[]) ?? []);
        }
        setLoading(false);
      });
  }, []);

  return { txns, loading, error };
}

export function useMonthlyByCategory(userId: string) {
  const [rows, setRows] = useState<MonthlyCategoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabase
      .from("v_monthly_by_category")
      .select("year_month,category_id,type,n_txns,total_abs")
      .eq("user_id", userId)
      .then(({ data, error }) => {
        if (error) setError(error.message);
        else {
          setError(null);
          setRows((data as MonthlyCategoryRow[]) ?? []);
        }
        setLoading(false);
      });
  }, [userId]);

  return { rows, loading, error };
}

export function useRecurring(userId: string) {
  const [recurring, setRecurring] = useState<Recurring[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabase
      .from("recurring")
      .select("id,name,amount,day_of_month,frequency,category_id,account_id,active")
      .eq("user_id", userId)
      .then(({ data, error }) => {
        if (error) setError(error.message);
        else {
          setError(null);
          setRecurring((data as Recurring[]) ?? []);
        }
        setLoading(false);
      });
  }, [userId]);

  return { recurring, loading, error };
}

export function useEnsureSeed(userId: string) {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    ensureSeed(userId)
      .catch((e) => {
        console.error("ensureSeed failed", e);
        if (!cancelled) setError(e instanceof Error ? e.message : "Erreur");
      })
      .finally(() => {
        if (!cancelled) setReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  return { ready, error };
}

export function useGoals() {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(() => {
    setLoading(true);
    supabase
      .from("goals")
      .select("id,name,icon,target_amount,current_amount,deadline,created_at")
      .order("created_at")
      .then(({ data, error }) => {
        if (error) setError(error.message);
        else {
          setError(null);
          setGoals((data as Goal[]) ?? []);
        }
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { goals, loading, error, refetch };
}

export function useUserSettings(userId: string) {
  const [settings, setSettings] = useState<UserSettings>(DEFAULT_SETTINGS);

  const refetch = useCallback(() => {
    getUserSettings(userId)
      .then((row) => setSettings(coerceSettings(row)))
      .catch(() => setSettings(DEFAULT_SETTINGS));
  }, [userId]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { settings, refetch };
}

export function useReminders() {
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(() => {
    setLoading(true);
    supabase
      .from("reminders")
      .select("id,label,due_date,amount,done,created_at")
      .order("due_date")
      .then(({ data, error }) => {
        if (error) setError(error.message);
        else {
          setError(null);
          setReminders((data as Reminder[]) ?? []);
        }
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { reminders, loading, error, refetch };
}

export function useGoalContributions() {
  const [contribByGoal, setContribByGoal] = useState<Record<string, number>>({});

  const refetch = useCallback(() => {
    supabase
      .from("transactions")
      .select("goal_id,amount")
      .eq("type", "savings")
      .not("goal_id", "is", null)
      .then(({ data }) => {
        const m: Record<string, number> = {};
        for (const r of (data as { goal_id: string; amount: number }[]) ?? []) {
          m[r.goal_id] = (m[r.goal_id] ?? 0) + Math.abs(Number(r.amount));
        }
        setContribByGoal(m);
      });
  }, []);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { contribByGoal, refetch };
}
