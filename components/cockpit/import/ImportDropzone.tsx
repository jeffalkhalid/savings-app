"use client";

export function ImportDropzone({ onFile }: { onFile: (file: File) => void }) {
  return (
    <label className="block border-2 border-dashed border-rule rounded-xl p-8 text-center cursor-pointer">
      <input
        type="file"
        accept=".xls"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
          // Reset pour permettre de re-sélectionner le même fichier après une erreur.
          e.target.value = "";
        }}
      />
      <div className="font-display text-lg mb-1">Importer un relevé BNP</div>
      <div className="text-ink-muted text-sm">Sélectionne ton export .xls</div>
    </label>
  );
}
