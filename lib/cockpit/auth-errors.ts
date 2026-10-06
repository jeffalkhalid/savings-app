/**
 * Traduction des messages d'erreur d'authentification.
 *
 * Supabase les rend en anglais. Seuls les plus courants sont traduits, avec
 * repli sur le message brut : inventer une traduction approximative de tout
 * finirait par afficher un contresens sur un cas rare, et un message anglais
 * exact vaut mieux qu'un message français faux.
 */
const KNOWN: { match: RegExp; fr: string }[] = [
  {
    match: /invalid login credentials/i,
    fr: "Email ou mot de passe incorrect.",
  },
  {
    match: /email not confirmed/i,
    fr: "Adresse non confirmée : ouvre le lien reçu par email avant de te connecter.",
  },
  {
    match: /user already registered|already been registered/i,
    fr: "Un compte existe déjà avec cette adresse.",
  },
  {
    match: /password should be at least (\d+)/i,
    fr: "Mot de passe trop court.",
  },
  {
    match: /unable to validate email|invalid email/i,
    fr: "Adresse email invalide.",
  },
  {
    match: /email rate limit exceeded|rate limit/i,
    fr: "Trop de tentatives. Réessaie dans quelques minutes.",
  },
  {
    match: /new password should be different/i,
    fr: "Le nouveau mot de passe doit être différent de l'ancien.",
  },
  {
    match: /failed to fetch|network/i,
    fr: "Connexion au serveur impossible. Vérifie ta connexion.",
  },
];

export function authErrorFr(message: string): string {
  for (const k of KNOWN) if (k.match.test(message)) return k.fr;
  return message;
}
