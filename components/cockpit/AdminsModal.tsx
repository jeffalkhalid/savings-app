"use client";

import { useEffect, useState } from "react";
import { UserPlus, UserMinus } from "lucide-react";
import {
  listAdmins,
  addAdminByEmail,
  removeAdmin,
  type AdminRow,
} from "@/lib/cockpit/admins-api";
import { adminEmailError } from "@/lib/cockpit/admins";

export function AdminsModal({
  userId,
  onClose,
}: {
  userId: string;
  onClose: () => void;
}) {
  const [admins, setAdmins] = useState<AdminRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const refetch = () => {
    setLoading(true);
    listAdmins()
      .then((a) => {
        setAdmins(a);
        setError("");
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Erreur"))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    refetch();
  }, []);

  const run = async (fn: () => Promise<void>): Promise<boolean> => {
    setError("");
    setBusy(true);
    try {
      await fn();
      refetch();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
      return false;
    } finally {
      setBusy(false);
    }
  };

  const add = async () => {
    const err = adminEmailError(email);
    if (err) {
      setError(err);
      return;
    }
    const ok = await run(() => addAdminByEmail(email.trim()));
    if (ok) setEmail("");
  };

  return (
    <div
      className="fixed inset-0 z-[1001] bg-black/50 flex items-end justify-center"
      onClick={onClose}
    >
      <div
        className="bg-paper w-full max-w-[600px] max-h-[90vh] overflow-auto px-6 pt-6 pb-10 rounded-t-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex justify-between items-center mb-4">
          <h2 className="font-display text-2xl">Admins</h2>
          <button className="text-ink-muted text-sm" onClick={onClose} type="button">
            Fermer
          </button>
        </header>

        {loading ? (
          <p className="text-ink-muted text-sm py-4">Chargement…</p>
        ) : (
          <div className="grid gap-1.5 mb-5">
            {admins.map((a) => (
              <div key={a.user_id} className="flex items-center gap-2">
                <span className="flex-1 text-sm truncate">{a.email}</span>
                {a.user_id === userId ? (
                  <span className="text-[11px] text-ink-muted">toi</span>
                ) : (
                  <button
                    type="button"
                    onClick={() => run(() => removeAdmin(a.user_id))}
                    disabled={busy}
                    className="text-accent p-1.5"
                    aria-label="Retirer"
                  >
                    <UserMinus size={16} />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        <section className="border-t border-rule pt-4">
          <h3 className="text-xs uppercase tracking-[0.1em] text-ink-muted mb-2">
            Ajouter un admin
          </h3>
          <div className="grid gap-2">
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="email@exemple.com"
              type="email"
              inputMode="email"
              className="border border-rule rounded-lg px-3 py-2.5 bg-card text-ink text-sm w-full"
            />
            <p className="text-[11px] text-ink-muted">
              La personne doit déjà avoir un compte.
            </p>
            <button
              type="button"
              onClick={add}
              disabled={busy || !email.trim()}
              className="bg-emerald text-[#FBF3EC] rounded-lg py-3 font-semibold flex items-center justify-center gap-2 disabled:opacity-60"
            >
              <UserPlus size={17} /> Ajouter
            </button>
          </div>
        </section>

        {error && <p className="text-accent text-sm mt-3">{error}</p>}
      </div>
    </div>
  );
}
