"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutGrid, Landmark, TrendingUp } from "lucide-react";

const ITEMS = [
  { href: "/cockpit", label: "Dashboard", Icon: LayoutGrid },
  { href: "/cockpit/patrimoine", label: "Patrimoine", Icon: Landmark },
  { href: "/cockpit/projection", label: "Projection", Icon: TrendingUp },
];

export function TabBar() {
  const pathname = usePathname();
  return (
    <nav className="fixed bottom-0 inset-x-0 z-50 bg-paper border-t border-rule pb-[env(safe-area-inset-bottom)]">
      <div className="max-w-[600px] mx-auto flex">
        {ITEMS.map(({ href, label, Icon }) => {
          const active = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              className={`flex-1 flex flex-col items-center gap-1 py-2.5 text-[11px] ${
                active ? "text-ink" : "text-ink-muted"
              }`}
            >
              <Icon size={20} strokeWidth={active ? 2.2 : 1.6} />
              {label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
