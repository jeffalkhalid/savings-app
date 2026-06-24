"use client";

import {
  AuthContext,
  useSession,
  useEnsureSeed,
  type AuthUser,
} from "@/lib/cockpit/hooks";
import { LoginForm } from "@/components/cockpit/LoginForm";
import { TabBar } from "@/components/cockpit/TabBar";

function Loading({ text }: { text: string }) {
  return (
    <main className="max-w-[600px] mx-auto px-6 py-16 text-ink-muted">
      {text}
    </main>
  );
}

function SeededShell({
  user,
  children,
}: {
  user: AuthUser;
  children: React.ReactNode;
}) {
  const { ready } = useEnsureSeed(user.id);
  if (!ready) return <Loading text="Préparation de votre espace…" />;
  return (
    <AuthContext.Provider value={user}>
      <div className="min-h-screen pb-24">{children}</div>
      <TabBar />
    </AuthContext.Provider>
  );
}

export default function CockpitLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, ready } = useSession();

  if (!ready) return <Loading text="Chargement…" />;
  if (!user) return <LoginForm />;
  return <SeededShell user={user}>{children}</SeededShell>;
}
