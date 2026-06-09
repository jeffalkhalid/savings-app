"use client";

type Cell = string | number;

export function downloadCSV(
  filename: string,
  headers: string[],
  rows: Cell[][],
) {
  const sep = ";"; // French CSV convention (Excel fr-FR parses ; natively)
  const escape = (cell: Cell): string => {
    let s = String(cell);
    // Use comma as decimal separator for numbers (French)
    if (typeof cell === "number" && !Number.isInteger(cell)) {
      s = cell.toLocaleString("fr-FR", {
        useGrouping: false,
        maximumFractionDigits: 2,
      });
    }
    if (s.includes(sep) || s.includes('"') || s.includes("\n")) {
      return '"' + s.replace(/"/g, '""') + '"';
    }
    return s;
  };

  const headerLine = headers.map(escape).join(sep);
  const bodyLines = rows.map((r) => r.map(escape).join(sep));
  const csv = "\uFEFF" + [headerLine, ...bodyLines].join("\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
