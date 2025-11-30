import { useEffect, useMemo, useState } from "react";
import type { SubtitleFile } from "../../core/types";
import { summarizeLevels } from "../../core/cefr/estimateLevel";
import { useDictionaryStore } from "../../state/dictionaryStore";
import { listSubtitleFiles } from "../../data/filesRepo";

function percentage(part: number, total: number) {
  if (total === 0) return 0;
  return Math.round((part / total) * 1000) / 10;
}

export default function StatsPage() {
  const words = useDictionaryStore((state) => state.words);
  const initializeDictionary = useDictionaryStore((state) => state.initialize);
  const initialized = useDictionaryStore((state) => state.initialized);

  const [subtitleFiles, setSubtitleFiles] = useState<SubtitleFile[]>([]);
  const [loadingFiles, setLoadingFiles] = useState(false);

  useEffect(() => {
    if (!initialized) {
      void initializeDictionary();
    }
  }, [initializeDictionary, initialized]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoadingFiles(true);
      const files = await listSubtitleFiles();
      if (!cancelled) {
        setSubtitleFiles(files);
        setLoadingFiles(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const totals = useMemo(() => {
    const learning = words.filter((word) => word.status === "learning");
    const known = words.filter((word) => word.status === "known");
    const cefr = summarizeLevels(learning);
    const total = words.length;
    const unknownPercent = percentage(learning.length, total);
    const ratio = learning.length === 0 ? null : Math.max(Math.round(total / learning.length), 1);
    const files = subtitleFiles.length;
    const cues = subtitleFiles.reduce((sum, file) => sum + file.totalCues, 0);

    return {
      total,
      learning,
      known,
      cefr,
      unknownPercent,
      ratio,
      files,
      cues,
    };
  }, [subtitleFiles, words]);

  return (
    <div className="space-y-6">
      <section className="grid gap-4 md:grid-cols-3">
        <div className="rounded-lg border border-white/10 bg-white/5 p-4">
          <h3 className="text-sm font-medium text-white/70">Unknown words</h3>
          <p className="mt-2 text-2xl font-semibold text-white">{totals.learning.length}</p>
          <p className="text-xs text-white/60">
            {totals.ratio ? `≈ 1 unknown every ${totals.ratio} saved words` : "Add words to track progress"}
          </p>
        </div>
        <div className="rounded-lg border border-white/10 bg-white/5 p-4">
          <h3 className="text-sm font-medium text-white/70">Known words</h3>
          <p className="mt-2 text-2xl font-semibold text-white">{totals.known.length}</p>
          <p className="text-xs text-white/60">{totals.total === 0 ? "" : `${totals.total} total saved words`}</p>
        </div>
        <div className="rounded-lg border border-white/10 bg-white/5 p-4">
          <h3 className="text-sm font-medium text-white/70">Library coverage</h3>
          <p className="mt-2 text-2xl font-semibold text-white">{totals.unknownPercent}% unknown</p>
          <p className="text-xs text-white/60">
            {totals.files} subtitle file{totals.files === 1 ? "" : "s"}
            {totals.cues > 0 ? ` · ${totals.cues.toLocaleString()} cues indexed` : ""}
          </p>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <div className="rounded-lg border border-white/10 bg-white/5 p-4">
          <h3 className="text-lg font-semibold">CEFR guess (unknown words)</h3>
          <p className="text-sm text-white/60">Fast heuristic using lightweight frequency lists.</p>
          <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3">
            {(Object.entries(totals.cefr.counts) as [string, number][]).map(([level, count]) => (
              <div key={level} className="rounded-md bg-black/40 p-3 text-center">
                <div className="text-lg font-semibold text-white">{level}</div>
                <div className="text-sm text-white/70">{count} words</div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-lg border border-white/10 bg-white/5 p-4">
          <h3 className="text-lg font-semibold">Library snapshot</h3>
          {loadingFiles ? (
            <p className="mt-2 text-sm text-white/60">Loading files…</p>
          ) : subtitleFiles.length === 0 ? (
            <p className="mt-2 text-sm text-white/60">No subtitle files stored yet.</p>
          ) : (
            <ul className="mt-3 space-y-2 text-sm text-white/80">
              {subtitleFiles.slice(0, 6).map((file) => (
                <li key={file.id} className="flex items-center justify-between rounded bg-black/40 px-3 py-2">
                  <div className="truncate">
                    <div className="truncate font-medium text-white">{file.name}</div>
                    <div className="text-xs text-white/60">{file.totalCues.toLocaleString()} cues</div>
                  </div>
                  <span className="text-xs text-white/50">{new Date(file.addedAt).toLocaleDateString()}</span>
                </li>
              ))}
              {subtitleFiles.length > 6 && (
                <li className="text-xs text-white/60">
                  +{subtitleFiles.length - 6} more subtitle file{subtitleFiles.length - 6 === 1 ? "" : "s"}
                </li>
              )}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}
