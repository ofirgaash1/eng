import { useCallback, useMemo, useState } from "react";
import {
  downloadOpenSubtitlesSubtitle,
  OPEN_SUBTITLES_DEFAULT_API_KEY,
  OPEN_SUBTITLES_FALLBACK_API_KEY,
  OPEN_SUBTITLES_LOCAL_API_KEY,
  type OpenSubtitlesItem,
  saveBlobAsDownload,
  searchOpenSubtitlesSubtitles,
} from "../../services/openSubtitles";

const DEFAULT_API_KEY = OPEN_SUBTITLES_DEFAULT_API_KEY;
const LOCAL_API_KEY = OPEN_SUBTITLES_LOCAL_API_KEY;
const FALLBACK_API_KEY = OPEN_SUBTITLES_FALLBACK_API_KEY;

type StatusTone = "neutral" | "loading" | "success" | "error";

type StatusMessage = {
  summary: string;
  details?: string;
  tone: StatusTone;
};

type SortField = "title" | "downloads" | "hearingImpaired";
type SortDirection = "asc" | "desc";

const toneStyles: Record<StatusTone, string> = {
  neutral: "border-white/10 bg-white/5 text-white/70",
  loading: "border-sky-400/40 bg-sky-400/10 text-sky-100",
  success: "border-emerald-400/40 bg-emerald-400/10 text-emerald-100",
  error: "border-rose-400/40 bg-rose-400/10 text-rose-100",
};

export default function VlsubPage() {
  const [apiKey, setApiKey] = useState(DEFAULT_API_KEY);
  const [file, setFile] = useState<File | null>(null);
  const [language, setLanguage] = useState("en");
  const [status, setStatus] = useState<StatusMessage>({
    summary: "",
    tone: "neutral",
  });
  const [results, setResults] = useState<OpenSubtitlesItem[] | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [sortField, setSortField] = useState<SortField>("downloads");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");

  const updateStatus = useCallback(
    (summary: string, tone: StatusTone = "neutral", details?: string) => {
      setStatus({ summary, tone, details });
    },
    [],
  );

  const ensureReady = useCallback(() => {
    if (!apiKey.trim()) {
      updateStatus("Please enter your OpenSubtitles API key.", "error");
      return false;
    }
    if (!file) {
      updateStatus("Please choose a video file.", "error");
      return false;
    }
    return true;
  }, [apiKey, file, updateStatus]);

  const clearResults = useCallback(() => {
    setResults([]);
  }, []);

  const searchSubtitles = useCallback(
    async (params: Record<string, string>) => {
      clearResults();
      updateStatus("Searching OpenSubtitles...", "loading");
      setIsSearching(true);

      try {
        const payload = await searchOpenSubtitlesSubtitles({
          apiKey,
          query: params.query,
          language: params.languages,
        });
        setResults(payload.items);
        updateStatus(
          `Found ${payload.totalCount} subtitle(s).`,
          "success",
        );
      } catch (error) {
        const message = (error as Error).message || "Search failed.";
        const [summary, ...rest] = message.split("\n");
        updateStatus(summary, "error", rest.join("\n"));
        clearResults();
      } finally {
        setIsSearching(false);
      }
    },
    [apiKey, clearResults, updateStatus],
  );

  const handleSearchName = async () => {
    if (!ensureReady() || !file) return;
    await searchSubtitles({
      query: file.name,
      languages: language,
    });
  };

  const handleDownload = useCallback(async (item: OpenSubtitlesItem) => {
    setDownloadingId(item.id);
    updateStatus("Preparing download...", "loading");
    try {
      const { blob, fileName } = await downloadOpenSubtitlesSubtitle({ apiKey, item });
      updateStatus(`Downloading ${fileName}...`, "loading");
      saveBlobAsDownload(blob, fileName);
      updateStatus(`Downloaded ${fileName}.`, "success");
    } catch (error) {
      const message = (error as Error).message || "Subtitle download failed.";
      const [summary, ...rest] = message.split("\n");
      updateStatus(summary, "error", rest.join("\n"));
    } finally {
      setDownloadingId(null);
    }
  }, [apiKey, updateStatus]);

  const statusToneStyle = toneStyles[status.tone];
  const statusLabel = status.summary || "";

  const resultsEmpty = useMemo(() => results !== null && results.length === 0, [results]);
  const sortedResults = useMemo(() => {
    if (!results) return null;
    const direction = sortDirection === "asc" ? 1 : -1;
    return [...results].sort((a, b) => {
      const aTitle = a.attributes.files?.[0]?.file_name ?? "Untitled release";
      const bTitle = b.attributes.files?.[0]?.file_name ?? "Untitled release";

      switch (sortField) {
        case "title":
          return aTitle.localeCompare(bTitle, undefined, { sensitivity: "base" }) * direction;
        case "downloads":
          return ((a.attributes.download_count ?? 0) - (b.attributes.download_count ?? 0)) * direction;
        case "hearingImpaired":
          return (Number(a.attributes.hearing_impaired) - Number(b.attributes.hearing_impaired)) * direction;
        default:
          return 0;
      }
    });
  }, [results, sortDirection, sortField]);

  const toggleSort = useCallback(
    (field: SortField) => {
      if (sortField === field) {
        setSortDirection((previous) => (previous === "asc" ? "desc" : "asc"));
        return;
      }
      setSortField(field);
      setSortDirection("desc");
    },
    [sortField],
  );

  return (
    <div className="space-y-8">
      <header className="rounded-2xl border border-white/10 bg-gradient-to-br from-white/10 via-white/5 to-transparent p-6 shadow-lg">
        <p className="text-sm uppercase tracking-[0.2em] text-white/60">VLSub Web</p>
        <h2 className="mt-3 text-3xl font-semibold text-white">
          Find subtitles for your video, straight from your browser.
        </h2>
        <p className="mt-3 max-w-2xl text-sm text-white/70">
          Select a local video file, look up subtitles by filename, and download the match you
          want. Powered by the OpenSubtitles API.
        </p>
      </header>

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-6 shadow-md">
          <h3 className="text-lg font-semibold text-white">1. Connect to OpenSubtitles</h3>
          <p className="mt-2 text-sm text-white/60">
            Enter your OpenSubtitles API key to search and download subtitles. You can create one at{" "}
            <a
              href="https://www.opensubtitles.com/"
              target="_blank"
              rel="noreferrer"
              className="text-white underline decoration-white/40 underline-offset-4"
            >
              opensubtitles.com
            </a>
            .
          </p>
          <label className="mt-4 flex flex-col gap-2 text-sm text-white/70">
            <span>API Key</span>
            <input
              id="apiKey"
              type="text"
              placeholder="Paste your API key"
              value={apiKey}
              onChange={(event) => setApiKey(event.target.value)}
              className="rounded-lg border border-white/10 bg-white/10 px-3 py-2 text-sm text-white placeholder:text-white/40 focus:border-white/40 focus:outline-none"
            />
            <div className="text-xs text-white/50">
              <div className="mt-1">If running locally, use:</div>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-white/70">
                <span className="rounded bg-white/10 px-2 py-1 text-xs">{LOCAL_API_KEY}</span>
                <button
                  type="button"
                  onClick={() => setApiKey(LOCAL_API_KEY)}
                  className="rounded border border-white/10 px-2 py-1 text-[11px] text-white/70 transition hover:border-white/30 hover:bg-white/10"
                >
                  Use this
                </button>
              </div>
              <div className="mt-2">If running from GitHub, use:</div>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-white/70">
                <span className="rounded bg-white/10 px-2 py-1 text-xs">{DEFAULT_API_KEY}</span>
                <button
                  type="button"
                  onClick={() => setApiKey(DEFAULT_API_KEY)}
                  className="rounded border border-white/10 px-2 py-1 text-[11px] text-white/70 transition hover:border-white/30 hover:bg-white/10"
                >
                  Use this
                </button>
              </div>
              <div className="mt-2">Or</div>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-white/70">
                <span className="rounded bg-white/10 px-2 py-1 text-xs">{FALLBACK_API_KEY}</span>
                <button
                  type="button"
                  onClick={() => setApiKey(FALLBACK_API_KEY)}
                  className="rounded border border-white/10 px-2 py-1 text-[11px] text-white/70 transition hover:border-white/30 hover:bg-white/10"
                >
                  Use this
                </button>
              </div>
            </div>
          </label>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/5 p-6 shadow-md">
          <h3 className="text-lg font-semibold text-white">2. Choose your video</h3>
          <p className="mt-2 text-sm text-white/60">
            We never upload your video. Only the filename is used for search.
          </p>
          <div className="mt-4 flex flex-col gap-2 text-sm text-white/70">
            <span>Video file</span>
            <input
              id="videoFile"
              type="file"
              accept="video/*,video/x-matroska,.mkv,.MKV,.mp4,.mov,.avi,.wmv,.flv,.webm,.m4v,.mpg,.mpeg"
              onChange={(event) => {
                const nextFile = event.target.files?.[0] ?? null;
                setFile(nextFile);
                if (nextFile) {
                  updateStatus(`Selected ${nextFile.name}`, "neutral");
                } else {
                  updateStatus("", "neutral");
                }
              }}
              className="rounded-lg border border-white/10 bg-white/10 px-3 py-2 text-sm text-white file:mr-4 file:rounded-md file:border-0 file:bg-white/20 file:px-3 file:py-2 file:text-sm file:text-white hover:file:bg-white/30"
            />
          </div>
          <div className="mt-4 flex flex-col gap-2 text-sm text-white/70">
            <span>Preferred language</span>
            <select
              id="language"
              value={language}
              onChange={(event) => setLanguage(event.target.value)}
              className="rounded-lg border border-white/20 bg-white px-3 py-2 text-sm text-slate-900 focus:border-white/40 focus:outline-none"
            >
              <option value="en">English</option>
              <option value="he">Hebrew</option>
              <option value="ar">Arabic</option>
              <option value="hi">Hindi</option>
              <option value="es">Spanish</option>
              <option value="fr">French</option>
              <option value="de">German</option>
              <option value="it">Italian</option>
              <option value="pt">Portuguese</option>
              <option value="nl">Dutch</option>
              <option value="pl">Polish</option>
              <option value="sv">Swedish</option>
              <option value="tr">Turkish</option>
              <option value="ja">Japanese</option>
              <option value="ko">Korean</option>
              <option value="zh">Chinese</option>
            </select>
          </div>
          <div className="mt-5 flex flex-wrap gap-3">
            <button
              id="searchName"
              type="button"
              onClick={handleSearchName}
              disabled={isSearching}
              className="rounded-full border border-white/20 bg-white/10 px-4 py-2 text-sm font-medium text-white transition hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Find subtitles
            </button>
          </div>
          <div
            id="status"
            role="status"
            aria-live="polite"
            className={`mt-4 rounded-xl border px-4 py-3 text-sm ${statusToneStyle}`}
          >
            {statusLabel}
            {status.details ? (
              <details className="mt-3 text-xs text-white/70" open>
                <summary className="cursor-pointer text-white/80">Show details</summary>
                <pre className="mt-2 whitespace-pre-wrap text-xs text-white/60">
                  {status.details}
                </pre>
              </details>
            ) : null}
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-white/10 bg-white/5 p-6 shadow-md">
        <h3 className="text-lg font-semibold text-white">3. Download your subtitle</h3>
        <div id="results" className="mt-4 space-y-4">
          {results === null ? (
            <p className="text-sm text-white/60">Search results will appear here.</p>
          ) : null}
          {resultsEmpty ? (
            <p className="text-sm text-white/60">No subtitles found. Try another search.</p>
          ) : null}
          {sortedResults && sortedResults.length > 0 ? (
            <div className="overflow-hidden rounded-xl border border-white/10">
              <table className="w-full text-left text-sm text-white/80">
                <thead className="bg-white/10 text-xs uppercase tracking-wide text-white/60">
                  <tr>
                    <th className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => toggleSort("title")}
                        className="flex items-center gap-2 hover:text-white"
                      >
                        Title
                        {sortField === "title" ? (sortDirection === "asc" ? "▲" : "▼") : null}
                      </button>
                    </th>
                    <th className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => toggleSort("downloads")}
                        className="flex items-center gap-2 hover:text-white"
                      >
                        Downloads
                        {sortField === "downloads" ? (sortDirection === "asc" ? "▲" : "▼") : null}
                      </button>
                    </th>
                    <th className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => toggleSort("hearingImpaired")}
                        className="flex items-center gap-2 hover:text-white"
                      >
                        Hearing impaired
                        {sortField === "hearingImpaired"
                          ? sortDirection === "asc"
                            ? "▲"
                            : "▼"
                          : null}
                      </button>
                    </th>
                    <th className="px-4 py-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {sortedResults.map((item) => {
                    const fileInfo = item.attributes.files?.[0];
                    const fileName = fileInfo?.file_name ?? "Untitled release";
                    return (
                      <tr key={item.id} className="bg-white/5">
                        <td className="px-4 py-3">
                          <div className="font-semibold text-white">{fileName}</div>
                        </td>
                        <td className="px-4 py-3 text-xs">{item.attributes.download_count ?? "-"}</td>
                        <td className="px-4 py-3 text-xs">
                          {item.attributes.hearing_impaired ? "Yes" : "No"}
                        </td>
                        <td className="px-4 py-3 text-right text-xs">
                          <button
                            type="button"
                            onClick={() => void handleDownload(item)}
                            disabled={
                              isSearching ||
                              downloadingId === item.id ||
                              !item.attributes.files?.some((file) => Number.isFinite(file.file_id))
                            }
                            className="inline-flex min-w-[9.5rem] items-center justify-center whitespace-nowrap rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs text-white transition hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {downloadingId === item.id ? "Downloading..." : "Download subtitle"}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>
      </section>

      <footer className="text-xs text-white/50">
        Built from the original VLSub workflow. This demo uses the OpenSubtitles API and requires
        your own API key.
      </footer>
    </div>
  );
}
