"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/cockpit/supabase";
import { authErrorFr } from "@/lib/cockpit/auth-errors";

const MIN_PASSWORD = 8;

/**
 * Atterrissage du lien « mot de passe oublié ».
 *
 * Volontairement HORS de `/cockpit` : le lien de récupération ouvre déjà une
 * session, donc le layout du cockpit verrait un utilisateur connecté et
 * déposerait la personne dans l'app — sans jamais lui faire changer son mot de
 * passe. C'est la raison d'être de cette route séparée.
 *
 * Le client Supabase est en flux implicite : le jeton arrive dans le fragment
 * d'URL et le SDK l'absorbe au chargement. `getSession()` attend cette
 * initialisation, donc un seul appel suffit — pas de minuterie.
 */
export default function ResetPage() {
  const router = useRouter();
  const [checked, setChecked] = useState(false);
  const [hasSession, setHasSession] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [linkError, setLinkError] = useState("");

  useEffect(() => {
    // Le fragment porte l'erreur quand le lien est expiré ou déjà consommé ;
    // il faut le lire avant que le SDK ne le nettoie.
    const hash = window.location.hash.replace(/^#/, "");
    const desc = new URLSearchParams(hash).get("error_description");
    if (desc) setLinkError(desc.replace(/\+/g, " "));

    supabase.auth.getSession().then(({ data }) => {
      setHasSession(Boolean(data.session));
      setChecked(true);
    });
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setErr("");
    if (password.length < MIN_PASSWORD) {
      setErr(`Le mot de passe doit faire au moins ${MIN_PASSWORD} caractères.`);
      return;
    }
    if (password !== confirm) {
      setErr("Les deux mots de passe ne correspondent pas.");
      return;
    }
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      setErr(authErrorFr(error.message));
      setBusy(false);
      return;
    }
    router.replace("/cockpit");
  };

  const input =
    "border border-rule rounded-lg px-3 py-3 bg-card text-ink text-base";

  return (
    <main className="max-w-[600px] mx-auto px-6 py-16 min-h-screen">
      <h1 className="font-display text-4xl mb-2">Nouveau mot de passe</h1>

      {!checked && <p className="text-ink-muted text-sm mt-6">Vérification du lien…</p>}

      {checked && !hasSession && (
        <>
          <p className="text-accent text-sm mt-6">
            {linkError
              ? `Ce lien n'est plus valable : ${linkError}`
              : "Ce lien n'est plus valable — il a peut-être expiré ou déjà été utilisé."}
          </p>
          <p className="text-ink-muted text-sm mt-3">
            Demande-en un nouveau depuis l&apos;écran de connexion.
          </p>
          <button
            type="button"
            onClick={() => router.replace("/cockpit")}
            className="bg-emerald text-paper rounded-lg py-3.5 px-5 font-semibold mt-6"
          >
            Retour à la connexion
          </button>
        </>
      )}

      {checked && hasSession && (
        <>
          <p className="text-ink-muted text-sm mb-6">
            Au moins {MIN_PASSWORD} caractères.
          </p>
          <form className="grid gap-3" onSubmit={submit}>
            <input
              className={input}
              type="password"
              placeholder="Nouveau mot de passe"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            <input
              className={input}
              type="password"
              placeholder="Confirme le mot de passe"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
            />
            <button
              className="bg-emerald text-paper rounded-lg py-3.5 font-semibold disabled:opacity-50"
              type="submit"
              disabled={busy}
            >
              {busy ? "Un instant…" : "Changer le mot de passe"}
            </button>
            {err && <p className="text-accent text-sm">{err}</p>}
          </form>
        </>
      )}
    </main>
  );
}
