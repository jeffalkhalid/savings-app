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
  useEffect(() => {
    supabase
      .from("categories")
      .select("id,name,type,color")
      .order("name")
      .then(({ data }) => setCategories((data as Category[]) ?? []));
  }, []);
  return { categories };
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
