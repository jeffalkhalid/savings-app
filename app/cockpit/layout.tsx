"use client";

import { AuthContext, useSession } from "@/lib/cockpit/hooks";
import { LoginForm } from "@/components/cockpit/LoginForm";
import { TabBar } from "@/components/cockpit/TabBar";

export default function CockpitLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, ready } = useSession();

  if (!ready) {
    return (
      <main className="max-w-[600px] mx-auto px-6 py-16 text-ink-muted">
        Chargement…
      </main>
    );
  }

  if (!user) return <LoginForm />;

  return (
    <AuthContext.Provider value={user}>
      <div className="min-h-screen pb-24">{children}</div>
      <TabBar />
    </AuthContext.Provider>
  );
}
