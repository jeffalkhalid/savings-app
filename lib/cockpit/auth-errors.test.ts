import { describe, it, expect } from "vitest";
import { authErrorFr } from "./auth-errors";

describe("authErrorFr", () => {
  it("traduit un identifiant invalide", () => {
    expect(authErrorFr("Invalid login credentials")).toBe(
      "Email ou mot de passe incorrect."
    );
  });

  it("traduit une adresse non confirmée", () => {
    expect(authErrorFr("Email not confirmed")).toMatch(/non confirmée/);
  });

  it("traduit un compte déjà existant, quelle que soit la formulation", () => {
    // Supabase a employé les deux tournures selon les versions.
    expect(authErrorFr("User already registered")).toMatch(/existe déjà/);
    expect(authErrorFr("Email address has already been registered")).toMatch(
      /existe déjà/
    );
  });

  it("nomme le quota d'envoi du projet plutôt que d'accuser l'utilisateur", () => {
    // La première version disait « trop de tentatives, réessaie dans quelques
    // minutes » : mauvaise cause, mauvais délai, et elle laissait croire
    // qu'insister suffirait.
    const fr = authErrorFr("Email rate limit exceeded");
    expect(fr).toMatch(/Limite d'envoi/);
    expect(fr).toMatch(/une heure/);
    expect(fr).not.toMatch(/tentatives/);
  });

  it("distingue la temporisation courte de sécurité", () => {
    expect(
      authErrorFr("For security purposes, you can only request this after 47 seconds.")
    ).toMatch(/quelques secondes/);
  });

  it("garde un message générique pour les autres limites de débit", () => {
    expect(authErrorFr("Too many requests")).toMatch(/Trop de tentatives/);
  });

  it("rend le message brut quand il est inconnu", () => {
    // Un message anglais exact vaut mieux qu'un message français faux.
    expect(authErrorFr("Some unmapped backend failure")).toBe(
      "Some unmapped backend failure"
    );
  });

  it("rend une chaîne vide telle quelle", () => {
    expect(authErrorFr("")).toBe("");
  });
});
