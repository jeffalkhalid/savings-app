export function adminEmailError(email: string): string | null {
  const e = email.trim();
  if (!e) return "Email requis";
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) return "Email invalide";
  return null;
}
