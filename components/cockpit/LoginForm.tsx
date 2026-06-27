"use client";

import { useState } from "react";
import { supabase } from "@/lib/cockpit/supabase";

export function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");

  return (
    <main className="max-w-[600px] mx-auto px-6 py-16 min-h-screen">
      <h1 className="font-display text-4xl mb-8">Cockpit</h1>
      <form
        className="grid gap-3"
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
          className="border border-rule rounded-lg px-3 py-3 bg-card text-ink text-base"
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <input
          className="border border-rule rounded-lg px-3 py-3 bg-card text-ink text-base"
          type="password"
          placeholder="Mot de passe"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        <button
          className="bg-emerald text-paper rounded-lg py-3.5 font-semibold"
          type="submit"
        >
          Se connecter
        </button>
        {err && <p className="text-strat-a text-sm">{err}</p>}
      </form>
    </main>
  );
}
