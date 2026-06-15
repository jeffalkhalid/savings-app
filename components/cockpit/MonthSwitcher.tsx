"use client";

export function MonthSwitcher({
  month,
  onChange,
}: {
  month: string;
  onChange: (m: string) => void;
}) {
  return (
    <input
      type="month"
      value={month}
      onChange={(e) => onChange(e.target.value)}
      className="font-mono-num text-xs text-ink-muted border border-rule rounded-full px-3 py-1.5 bg-transparent"
    />
  );
}
