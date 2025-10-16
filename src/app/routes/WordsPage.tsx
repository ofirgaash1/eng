import { useEffect, useMemo } from "react";
import { useDictionaryStore } from "../../state/dictionaryStore";

export default function WordsPage() {
  const words = useDictionaryStore((state) => state.words);
  const initialized = useDictionaryStore((state) => state.initialized);
  const initialize = useDictionaryStore((state) => state.initialize);

  useEffect(() => {
    if (!initialized) {
      void initialize();
    }
  }, [initialized, initialize]);

  const sorted = useMemo(
    () => [...words].sort((a, b) => b.updatedAt - a.updatedAt),
    [words]
  );

  if (!initialized) {
    return (
      <div className="space-y-4">
        <h2 className="text-xl font-semibold">Unknown Words</h2>
        <p className="text-sm text-white/60">Loading your saved vocabulary…</p>
      </div>
    );
  }

  if (sorted.length === 0) {
    return (
      <div className="space-y-4">
        <h2 className="text-xl font-semibold">Unknown Words</h2>
        <p className="text-sm text-white/60">
          Click a word in the player to add it to your learning list.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Unknown Words</h2>
        <span className="text-xs text-white/50">{sorted.length} items</span>
      </div>
      <div className="overflow-hidden rounded-lg border border-white/10">
        <table className="min-w-full divide-y divide-white/10">
          <thead className="bg-white/5 text-left text-xs uppercase tracking-wide text-white/60">
            <tr>
              <th className="px-4 py-2">Word</th>
              <th className="px-4 py-2">Normalized</th>
              <th className="px-4 py-2">Stem</th>
              <th className="px-4 py-2">Translation</th>
              <th className="px-4 py-2">Notes</th>
              <th className="px-4 py-2 text-right">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/10 text-sm">
            {sorted.map((word) => (
              <tr key={word.id} className="hover:bg-white/5">
                <td className="px-4 py-2 font-medium">{word.original}</td>
                <td className="px-4 py-2 text-white/70">{word.normalized}</td>
                <td className="px-4 py-2 text-white/70">{word.stem}</td>
                <td className="px-4 py-2 text-white/80">{word.translation ?? "—"}</td>
                <td className="px-4 py-2 text-white/60">{word.notes ?? "—"}</td>
                <td className="px-4 py-2 text-right text-xs uppercase tracking-wide text-white/60">
                  {word.status}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
