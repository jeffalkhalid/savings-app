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
    // Le quota d'envoi du projet, pas le comportement de la personne. Le
    // service intégré de Supabase n'envoie que quelques emails par heure tant
    // qu'aucun SMTP n'est configuré, et réessayer n'y change rien — d'où un
    // message qui nomme la vraie cause plutôt que d'accuser l'utilisateur.
    match: /email rate limit|over_email_send_rate_limit/i,
    fr: "Limite d'envoi d'emails du projet atteinte — ce n'est pas toi. Elle se réarme au bout d'une heure ; configurer un service SMTP la supprime.",
  },
  {
    // Celui-ci EST une temporisation courte, et Supabase donne le délai.
    match: /for security purposes.*?(\d+) seconds?/i,
    fr: "Attends quelques secondes avant de réessayer.",
  },
  {
    match: /rate limit|too many requests/i,
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
