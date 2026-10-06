"use client";

import { useState } from "react";
import { supabase } from "@/lib/cockpit/supabase";
import { authErrorFr } from "@/lib/cockpit/auth-errors";

type Mode = "connexion" | "inscription" | "oubli";

/** Plancher côté client. Supabase accepte 6 par défaut ; sur une app qui
 *  porte des données financières, six caractères sont trop peu. */
const MIN_PASSWORD = 8;

const TITLES: Record<Mode, string> = {
  connexion: "Cockpit",
  inscription: "Créer un compte",
  oubli: "Mot de passe oublié",
};

export function LoginForm() {
  const [mode, setMode] = useState<Mode>("connexion");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [note, setNote] = useState("");

  const go = (next: Mode) => {
    setMode(next);
    setErr("");
    setNote("");
    setPassword("");
    setConfirm("");
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setErr("");
    setNote("");

    if (mode === "inscription") {
      if (password.length < MIN_PASSWORD) {
        setErr(`Le mot de passe doit faire au moins ${MIN_PASSWORD} caractères.`);
        return;
      }
      if (password !== confirm) {
        setErr("Les deux mots de passe ne correspondent pas.");
        return;
      }
    }

    setBusy(true);
    try {
      if (mode === "connexion") {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) setErr(authErrorFr(error.message));
        // Au succès, `onAuthStateChange` monte le Cockpit : rien à faire ici.
      } else if (mode === "inscription") {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: `${window.location.origin}/cockpit` },
        });
        if (error) {
          setErr(authErrorFr(error.message));
        } else if (!data.session) {
          // Pas de session : le projet exige une confirmation par email.
          // C'est la seule façon de distinguer les deux configurations, et
          // l'utilisateur doit savoir laquelle s'applique à lui.
          setNote(
            "Compte créé. Ouvre le lien envoyé à ton adresse pour l'activer, puis reviens te connecter."
          );
          setMode("connexion");
        }
        // Avec une session, le Cockpit se monte tout seul.
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/reset`,
        });
        // Message identique dans les deux cas : dire « cette adresse est
        // inconnue » révélerait à un inconnu quelles adresses ont un compte.
        if (error && /rate limit/i.test(error.message)) {
          setErr(authErrorFr(error.message));
        } else {
          setNote(
            "Si un compte existe pour cette adresse, un lien de réinitialisation vient d'être envoyé."
          );
        }
      }
    } finally {
      setBusy(false);
    }
  };

  const input =
    "border border-rule rounded-lg px-3 py-3 bg-card text-ink text-base";
  const link = "text-ink-muted text-sm underline text-left";

  return (
    <main className="max-w-[600px] mx-auto px-6 py-16 min-h-screen">
      <header className="mb-6">
        <h1 className="font-display text-4xl">{TITLES[mode]}</h1>
        {mode === "oubli" && (
          <p className="text-ink-muted text-sm mt-2">
            Indique ton adresse : tu recevras un lien pour choisir un nouveau
            mot de passe.
          </p>
        )}
        {mode === "inscription" && (
          <p className="text-ink-muted text-sm mt-2">
            Au moins {MIN_PASSWORD} caractères.
          </p>
        )}
      </header>

      <form className="grid gap-3" onSubmit={submit}>
        <input
          className={input}
          type="email"
          placeholder="Email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />

        {mode !== "oubli" && (
          <input
            className={input}
            type="password"
            placeholder="Mot de passe"
            autoComplete={
              mode === "inscription" ? "new-password" : "current-password"
            }
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        )}

        {mode === "inscription" && (
          <input
            className={input}
            type="password"
            placeholder="Confirme le mot de passe"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
          />
        )}

        <button
          className="bg-emerald text-paper rounded-lg py-3.5 font-semibold disabled:opacity-50"
          type="submit"
          disabled={busy}
        >
          {busy
            ? "Un instant…"
            : mode === "connexion"
              ? "Se connecter"
              : mode === "inscription"
                ? "Créer le compte"
                : "Envoyer le lien"}
        </button>

        {err && <p className="text-accent text-sm">{err}</p>}
        {note && <p className="text-emerald text-sm">{note}</p>}
      </form>

      <div className="grid gap-2 mt-6 pt-6 border-t border-rule">
        {mode !== "connexion" && (
          <button type="button" className={link} onClick={() => go("connexion")}>
            J&apos;ai déjà un compte
          </button>
        )}
        {mode !== "inscription" && (
          <button
            type="button"
            className={link}
            onClick={() => go("inscription")}
          >
            Créer un compte
          </button>
        )}
        {mode !== "oubli" && (
          <button type="button" className={link} onClick={() => go("oubli")}>
            Mot de passe oublié ?
          </button>
        )}
      </div>
    </main>
  );
}
