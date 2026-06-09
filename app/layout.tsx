import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Simulateur épargne salariale",
  description:
    "PEG vs PER, recyclage, plafonds d'abondement, fiscalité de sortie — 6 stratégies comparées en temps réel.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="fr">
      <body className="min-h-screen bg-paper text-ink">{children}</body>
    </html>
  );
}
