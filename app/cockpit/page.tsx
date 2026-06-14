"use client";

import { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

type Txn = {
  id: string;
  date: string;
  amount: number;
  description: string;
  type: "expense" | "income" | "transfer" | "savings";
};

const eur = (n: number) =>
  new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(n);

export default function Page() {
  const [user, setUser] = useState<{ email?: string } | null>(null);
  const [ready, setReady] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [txns, setTxns] = useState<Txn[]>([]);
  const [month, setMonth] = useState("2026-05");

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user);
      setReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_, s) =>
      setUser(s?.user ?? null)
    );
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) return;
    const [y, m] = month.split("-").map(Number);
    const start = `${month}-01`;
    const next =
      m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;
    supabase
      .from("transactions")
      .select("*")
      .gte("date", start)
      .lt("date", next)
      .order("date", { ascending: false })
      .then(({ data }) => setTxns((data as Txn[]) ?? []));
  }, [user, month]);

  if (!ready) return <main style={S.shell}>Chargement…</main>;

  if (!user) {
    return (
      <main style={S.shell}>
        <h1 style={S.h1}>Cockpit</h1>
        <form
          style={{ display: "grid", gap: 12 }}
          onSubmit={async (e) => {
            e.preventDefault();
            setErr("");
            const { error } = await supabase.auth.signInWithPassword({
              email,
              password,
            });
            if (error) setErr(error.message);
          }}
        >
          <input
            style={S.input}
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <input
            style={S.input}
            type="password"
            placeholder="Mot de passe"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          <button style={S.btn} type="submit">
            Se connecter
          </button>
          {err && <p style={{ color: "#C62828" }}>{err}</p>}
        </form>
      </main>
    );
  }

  const sum = (t: string) =>
    txns.filter((x) => x.type === t).reduce((a, x) => a + Math.abs(Number(x.amount)), 0);
  const income = sum("income");
  const expense = sum("expense");
  const transfer = sum("transfer");
  const savings = sum("savings");
  const real = income - expense - transfer - savings;

  return (
    <main style={S.shell}>
      <header style={S.header}>
        <div>
          <h1 style={S.h1}>Cockpit</h1>
          <input
            style={S.month}
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
          />
        </div>
        <button style={S.linkBtn} onClick={() => supabase.auth.signOut()}>
          Déco
        </button>
      </header>

      <section style={S.grid}>
        <Stat label="Revenus" v={income} c="#1B5E40" />
        <Stat label="Dépenses" v={expense} c="#C62828" />
        <Stat label="Transferts" v={transfer} c="#0288D1" />
        <Stat label="Épargne réelle" v={real} c={real >= 0 ? "#1B5E40" : "#C62828"} />
      </section>

      <h2 style={S.h2}>{txns.length} transactions</h2>
      <ul style={S.list}>
        {txns.map((t) => (
          <li key={t.id} style={S.row}>
            <span>{t.description}</span>
            <strong style={{ color: t.amount < 0 ? "#C62828" : "#1B5E40" }}>
              {eur(t.amount)}
            </strong>
          </li>
        ))}
      </ul>
    </main>
  );
}

function Stat({ label, v, c }: { label: string; v: number; c: string }) {
  return (
    <div style={S.card}>
      <div style={S.cardLabel}>{label}</div>
      <div style={{ ...S.cardValue, color: c }}>{eur(v)}</div>
    </div>
  );
}

const S = {
  shell: {
    maxWidth: 600,
    margin: "0 auto",
    padding: 24,
    fontFamily: "system-ui, -apple-system, sans-serif",
    color: "#1A1B1F",
    background: "#FAF8F4",
    minHeight: "100vh",
  } as const,
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 24,
  } as const,
  h1: { fontSize: 28, fontWeight: 700, margin: 0 } as const,
  h2: { fontSize: 16, fontWeight: 600, color: "#666", marginBottom: 12 } as const,
  month: {
    padding: 8,
    border: "1px solid #ddd",
    borderRadius: 6,
    marginTop: 8,
    fontSize: 14,
  } as const,
  input: {
    padding: 12,
    border: "1px solid #ddd",
    borderRadius: 6,
    fontSize: 16,
  } as const,
  btn: {
    padding: 12,
    background: "#1B5E40",
    color: "white",
    border: "none",
    borderRadius: 6,
    fontSize: 16,
    fontWeight: 600,
  } as const,
  linkBtn: {
    background: "transparent",
    border: "none",
    color: "#666",
    cursor: "pointer",
    fontSize: 14,
  } as const,
  grid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 12,
    marginBottom: 24,
  } as const,
  card: {
    padding: 16,
    background: "white",
    border: "1px solid #eee",
    borderRadius: 8,
  } as const,
  cardLabel: {
    fontSize: 12,
    color: "#666",
    textTransform: "uppercase" as const,
    letterSpacing: 0.5,
  } as const,
  cardValue: { fontSize: 20, fontWeight: 700, marginTop: 4 } as const,
  list: { listStyle: "none", padding: 0, margin: 0 } as const,
  row: {
    padding: "12px 0",
    borderBottom: "1px solid #eee",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  } as const,
};
