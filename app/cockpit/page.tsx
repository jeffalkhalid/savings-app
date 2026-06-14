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
type Category = { id: string; name: string; type: string; color: string };
type Account = { id: string; name: string };

const eur = (n: number) =>
  new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(n);

const todayISO = () => new Date().toISOString().slice(0, 10);
const currentMonth = () => todayISO().slice(0, 7);

export default function Page() {
  const [user, setUser] = useState<{ id: string; email?: string } | null>(null);
  const [ready, setReady] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [txns, setTxns] = useState<Txn[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [month, setMonth] = useState("2026-05");
  const [showAdd, setShowAdd] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUser((data.user as any) ?? null);
      setReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_, s) =>
      setUser((s?.user as any) ?? null)
    );
    return () => sub.subscription.unsubscribe();
  }, []);

  const fetchTxns = () => {
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
  };

  useEffect(() => {
    if (!user) return;
    fetchTxns();
    supabase
      .from("categories")
      .select("id,name,type,color")
      .order("name")
      .then(({ data }) => setCategories((data as Category[]) ?? []));
    supabase
      .from("accounts")
      .select("id,name")
      .order("name")
      .then(({ data }) => setAccounts((data as Account[]) ?? []));
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
            const { error } = await supabase.auth.signInWithPassword({ email, password });
            if (error) setErr(error.message);
          }}
        >
          <input style={S.input} type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <input style={S.input} type="password" placeholder="Mot de passe" value={password} onChange={(e) => setPassword(e.target.value)} required />
          <button style={S.btn} type="submit">Se connecter</button>
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
          <input style={S.month} type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
        </div>
        <button style={S.linkBtn} onClick={() => supabase.auth.signOut()}>Déco</button>
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
            <div>
              <div>{t.description}</div>
              <div style={{ fontSize: 11, color: "#999" }}>{t.date}</div>
            </div>
            <strong style={{ color: t.amount < 0 ? "#C62828" : "#1B5E40" }}>{eur(t.amount)}</strong>
          </li>
        ))}
      </ul>

      <button style={S.fab} onClick={() => setShowAdd(true)} aria-label="Ajouter">+</button>

      {showAdd && (
        <AddModal
          userId={user.id}
          categories={categories}
          accounts={accounts}
          onClose={() => setShowAdd(false)}
          onSaved={() => { fetchTxns(); setShowAdd(false); }}
        />
      )}
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

function AddModal({ userId, categories, accounts, onClose, onSaved }: {
  userId: string;
  categories: Category[];
  accounts: Account[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [date, setDate] = useState(todayISO());
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [categoryId, setCategoryId] = useState(categories[0]?.id ?? "");
  const [accountId, setAccountId] = useState(
    accounts.find((a) => a.name.includes("BNP"))?.id ?? accounts[0]?.id ?? ""
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    const cat = categories.find((c) => c.id === categoryId);
    if (!cat) { setError("Catégorie requise"); return; }
    const amt = parseFloat(amount.replace(",", "."));
    if (!isFinite(amt) || amt <= 0) { setError("Montant invalide"); return; }
    const sign = cat.type === "income" ? 1 : -1;

    setSaving(true);
    const { error: e2 } = await supabase.from("transactions").insert({
      user_id: userId,
      date,
      amount: sign * amt,
      description: description || cat.name,
      merchant: description || null,
      category_id: categoryId,
      account_id: accountId,
      type: cat.type,
      source: "manual",
    });
    setSaving(false);
    if (e2) { setError(e2.message); return; }
    onSaved();
  };

  return (
    <div style={S.overlay} onClick={onClose}>
      <div style={S.modal} onClick={(e) => e.stopPropagation()}>
        <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h2 style={S.h1}>Nouvelle transaction</h2>
          <button style={S.linkBtn} onClick={onClose} type="button">Annuler</button>
        </header>
        <form onSubmit={save} style={{ display: "grid", gap: 12 }}>
          <label style={S.label}>
            Montant (€)
            <input style={S.input} type="text" inputMode="decimal" autoFocus placeholder="0,00" value={amount} onChange={(e) => setAmount(e.target.value)} required />
          </label>
          <label style={S.label}>
            Description
            <input style={S.input} type="text" placeholder="Ex. Carrefour, Uber, café…" value={description} onChange={(e) => setDescription(e.target.value)} />
          </label>
          <label style={S.label}>
            Catégorie
            <select style={S.input} value={categoryId} onChange={(e) => setCategoryId(e.target.value)} required>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.name} ({c.type})</option>
              ))}
            </select>
          </label>
          <label style={S.label}>
            Compte
            <select style={S.input} value={accountId} onChange={(e) => setAccountId(e.target.value)} required>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
          </label>
          <label style={S.label}>
            Date
            <input style={S.input} type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
          </label>
          <button style={S.btn} type="submit" disabled={saving}>
            {saving ? "Enregistrement…" : "Enregistrer"}
          </button>
          {error && <p style={{ color: "#C62828" }}>{error}</p>}
        </form>
      </div>
    </div>
  );
}

const S = {
  shell: { maxWidth: 600, margin: "0 auto", padding: 24, fontFamily: "system-ui, -apple-system, sans-serif", color: "#1A1B1F", background: "#FAF8F4", minHeight: "100vh", paddingBottom: 100 } as const,
  header: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 } as const,
  h1: { fontSize: 28, fontWeight: 700, margin: 0 } as const,
  h2: { fontSize: 16, fontWeight: 600, color: "#666", marginBottom: 12 } as const,
  month: { padding: 8, border: "1px solid #ddd", borderRadius: 6, marginTop: 8, fontSize: 14 } as const,
  input: { padding: 12, border: "1px solid #ddd", borderRadius: 6, fontSize: 16, background: "white", width: "100%", boxSizing: "border-box" as const } as const,
  btn: { padding: 14, background: "#1B5E40", color: "white", border: "none", borderRadius: 6, fontSize: 16, fontWeight: 600, cursor: "pointer" } as const,
  linkBtn: { background: "transparent", border: "none", color: "#666", cursor: "pointer", fontSize: 14 } as const,
  grid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 24 } as const,
  card: { padding: 16, background: "white", border: "1px solid #eee", borderRadius: 8 } as const,
  cardLabel: { fontSize: 12, color: "#666", textTransform: "uppercase" as const, letterSpacing: 0.5 } as const,
  cardValue: { fontSize: 20, fontWeight: 700, marginTop: 4 } as const,
  list: { listStyle: "none", padding: 0, margin: 0 } as const,
  row: { padding: "12px 0", borderBottom: "1px solid #eee", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 } as const,
  label: { display: "grid", gap: 6, fontSize: 13, color: "#666" } as const,
  fab: { position: "fixed" as const, bottom: 32, right: 24, width: 56, height: 56, borderRadius: 28, background: "#1B5E40", color: "white", border: "none", fontSize: 28, fontWeight: 300, boxShadow: "0 4px 12px rgba(0,0,0,0.2)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", lineHeight: 1, zIndex: 100 } as const,
  overlay: { position: "fixed" as const, inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 1000 } as const,
  modal: { background: "#FAF8F4", width: "100%", maxWidth: 600, maxHeight: "90vh", overflow: "auto", padding: 24, borderTopLeftRadius: 16, borderTopRightRadius: 16, paddingBottom: 40 } as const,
};