import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Simulateur épargne salariale",
  description:
    "PEG vs PER, recyclage, plafonds d'abondement, fiscalité de sortie — 6 stratégies comparées en temps réel.",
};

export const viewport: Viewport = {
  themeColor: "#FAF8F4",
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
