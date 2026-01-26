import { useCallback, useMemo, useState } from "react";

const HASH_CHUNK_SIZE = 64 * 1024;
const API_BASE = "https://api.opensubtitles.com/api/v1";
const DEFAULT_API_KEY = "UVUt5ZRVmROJD7ot9JVJY63n8RTIhxYW";
const API_CONSUMER_NAME = "ofir gaash v1.0";

const readChunk = async (file: File, start: number, length: number) => {
  const slice = file.slice(start, start + length);
  const buffer = await slice.arrayBuffer();
  return new DataView(buffer);
};

const sumChunk = (view: DataView) => {
  let sum = 0n;
  const length = view.byteLength - (view.byteLength % 8);
  for (let i = 0; i < length; i += 8) {
    sum += view.getBigUint64(i, true);
  }
  return sum;
};

const computeHash = async (file: File) => {
  const size = file.size;
  const firstChunk = await readChunk(file, 0, HASH_CHUNK_SIZE);
  const lastStart = Math.max(0, size - HASH_CHUNK_SIZE);
  const lastChunk = await readChunk(file, lastStart, HASH_CHUNK_SIZE);
  let hash = BigInt(size);
  hash += sumChunk(firstChunk);
  hash += sumChunk(lastChunk);
  return hash.toString(16).padStart(16, "0");
};

type StatusTone = "neutral" | "loading" | "success" | "error";

type StatusMessage = {
  summary: string;
  details?: string;
  tone: StatusTone;
};

type SubtitleFile = {
  file_id: number;
  file_name: string;
  file_size?: number;
};

type SubtitleItem = {
  id: string;
  attributes: {
    release?: string;
    language: string;
    download_count?: number;
    hearing_impaired?: boolean;
    feature_details?: {
      title?: string;
    };
    files?: SubtitleFile[];
  };
  downloadLink?: string;
};

type SortField = "title" | "downloads" | "hearingImpaired";
type SortDirection = "asc" | "desc";

const buildHeaders = (apiKey: string) => ({
  "Api-Key": apiKey.trim(),
  "Content-Type": "application/json",
  "X-User-Agent": API_CONSUMER_NAME,
});

const describeResponse = async (response: Response) => {
  let bodyText = "";
  try {
    bodyText = await response.text();
  } catch (error) {
    bodyText = `Unable to read response body: ${(error as Error).message}`;
  }

  const requestId =
    response.headers.get("x-kong-request-id") ||
    response.headers.get("x-request-id") ||
    response.headers.get("x-amzn-requestid");
  const retryAfter = response.headers.get("retry-after");
  const contentType = response.headers.get("content-type");

  const lines = [
    `Status: ${response.status} ${response.statusText}`.trim(),
    requestId ? `Request ID: ${requestId}` : null,
    retryAfter ? `Retry-After: ${retryAfter}` : null,
    contentType ? `Content-Type: ${contentType}` : null,
    bodyText ? `Body: ${bodyText.slice(0, 800)}` : null,
  ].filter(Boolean);

  return lines.join("\n");
};

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
  const [results, setResults] = useState<SubtitleItem[] | null>(null);
  const [isSearching, setIsSearching] = useState(false);
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
        const url = new URL(`${API_BASE}/subtitles`);
        Object.entries(params).forEach(([key, value]) => {
          if (value) {
            url.searchParams.set(key, value);
          }
        });

        const response = await fetch(url, { headers: buildHeaders(apiKey) });
        if (!response.ok) {
          const details = await describeResponse(response);
          throw new Error(`Search failed.\n${details}`);
        }
        const payload = (await response.json()) as {
          data?: SubtitleItem[];
          total_count?: number;
        };
        setResults(payload.data ?? []);
        updateStatus(
          `Found ${payload.total_count ?? payload.data?.length ?? 0} subtitle(s).`,
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

  const handleSearchHash = async () => {
    if (!ensureReady() || !file) return;
    updateStatus("Calculating video hash...", "loading");
    try {
      const hash = await computeHash(file);
      await searchSubtitles({
        moviehash: hash,
        moviehash_match: "1",
        languages: language,
      });
    } catch (error) {
      updateStatus(`Hash failed: ${(error as Error).message}`, "error");
    }
  };

  const handleSearchName = async () => {
    if (!ensureReady() || !file) return;
    await searchSubtitles({
      query: file.name,
      languages: language,
    });
  };

  const handleDownload = async (item: SubtitleItem) => {
    const fileInfo = item.attributes.files?.[0];
    if (!fileInfo?.file_id) {
      updateStatus("This subtitle entry does not include a file id.", "error");
      return;
    }
    updateStatus("Preparing download...", "loading");
    try {
      const response = await fetch(`${API_BASE}/download`, {
        method: "POST",
        headers: buildHeaders(apiKey),
        body: JSON.stringify({ file_id: fileInfo.file_id }),
      });
      if (!response.ok) {
        const details = await describeResponse(response);
        throw new Error(`Download request failed.\n${details}`);
      }
      const payload = (await response.json()) as { link?: string };
      setResults((prev) =>
        prev?.map((entry) =>
          entry.id === item.id ? { ...entry, downloadLink: payload.link } : entry,
        ) ?? [],
      );
      updateStatus("Download link ready.", "success");
    } catch (error) {
      const message = (error as Error).message || "Download request failed.";
      const [summary, ...rest] = message.split("\n");
      updateStatus(summary, "error", rest.join("\n"));
    }
  };

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
          Select a local video file, look up subtitles by hash or filename, and download the match
          you want. Powered by the OpenSubtitles API.
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
              type="password"
              placeholder="Paste your API key"
              value={apiKey}
              onChange={(event) => setApiKey(event.target.value)}
              className="rounded-lg border border-white/10 bg-white/10 px-3 py-2 text-sm text-white placeholder:text-white/40 focus:border-white/40 focus:outline-none"
            />
            <p className="text-xs text-white/50">
              if this key doesnt work, try:
              <span className="mt-1 block">oq1XXcuCnNOnaFDKbknI2pxaQO8TiiU5</span>
              <span className="mt-1 block">or if you are running locally:</span>
              <span className="mt-1 block">Er4Y8GbS7JoCcLf9oJmjc2noj2wIsrNu</span>
            </p>
          </label>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/5 p-6 shadow-md">
          <h3 className="text-lg font-semibold text-white">2. Choose your video</h3>
          <p className="mt-2 text-sm text-white/60">
            We never upload your video. The hash is computed locally in your browser.
          </p>
          <div className="mt-4 flex flex-col gap-2 text-sm text-white/70">
            <span>Video file</span>
            <input
              id="videoFile"
              type="file"
              accept="video/*,.mkv,.mp4,.mov,.avi,.wmv,.flv,.webm,.m4v,.mpg,.mpeg"
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
              id="searchHash"
              type="button"
              onClick={handleSearchHash}
              disabled={isSearching}
              className="rounded-full border border-white/20 bg-white/10 px-4 py-2 text-sm font-medium text-white transition hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Search by hash
            </button>
            <button
              id="searchName"
              type="button"
              onClick={handleSearchName}
              disabled={isSearching}
              className="rounded-full border border-white/10 px-4 py-2 text-sm font-medium text-white/70 transition hover:border-white/20 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Search by filename
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
                          {item.downloadLink ? (
                            <a
                              href={item.downloadLink}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex min-w-[9.5rem] items-center justify-center rounded-full border border-white/20 px-3 py-1 text-xs text-white/80 transition hover:bg-white/10"
                            >
                              Download subtitle
                            </a>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleDownload(item)}
                              disabled={isSearching}
                              className="inline-flex min-w-[9.5rem] items-center justify-center whitespace-nowrap rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs text-white transition hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              Get download link
                            </button>
                          )}
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
