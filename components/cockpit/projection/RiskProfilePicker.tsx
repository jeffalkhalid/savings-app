"use client";

import { RISK_PROFILES } from "@/lib/cockpit/monte-carlo";

export function RiskProfilePicker({
  activeKey,
  onSelect,
}: {
  activeKey: string | null;
  onSelect: (mu: number, sigma: number, key: string) => void;
}) {
  return (
    <section className="grid gap-1.5 text-[13px] text-ink-muted mt-5">
      Profil de risque
      <div className="flex gap-2">
        {RISK_PROFILES.map((p) => (
          <button
            key={p.key}
            type="button"
            onClick={() => onSelect(p.mu, p.sigma, p.key)}
            className={`flex-1 text-center text-[12px] py-2 rounded-xl font-medium ${
              activeKey === p.key
                ? "bg-accent text-[#FBF3EC]"
                : "bg-seg text-ink-muted"
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>
    </section>
  );
}
