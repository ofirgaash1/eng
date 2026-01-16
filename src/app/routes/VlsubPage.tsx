import { useCallback, useMemo, useState } from "react";

const HASH_CHUNK_SIZE = 64 * 1024;
const API_BASE = "https://api.opensubtitles.com/api/v1";
const DEFAULT_API_KEY = "Er4Y8GbS7JoCcLf9oJmjc2noj2wIsrNu";
const API_CONSUMER_NAME = "ofir gaash v1.0";

const formatBytes = (bytes: number) => {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let size = bytes;
  let index = 0;
  while (size >= 1024 && index < units.length - 1) {
    size /= 1024;
    index += 1;
  }
  return `${size.toFixed(1)} ${units[index]}`;
};

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

      <section className="grid gap-6 lg:grid-cols-[repeat(3,minmax(0,1fr))]">
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
              accept="video/*"
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
              className="rounded-lg border border-white/10 bg-white/10 px-3 py-2 text-sm text-white focus:border-white/40 focus:outline-none"
            >
              <option value="en">English</option>
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

        <div className="rounded-2xl border border-white/10 bg-white/5 p-6 shadow-md">
          <h3 className="text-lg font-semibold text-white">3. Download your subtitle</h3>
          <div id="results" className="mt-4 space-y-4">
            {results === null ? (
              <p className="text-sm text-white/60">Search results will appear here.</p>
            ) : null}
            {resultsEmpty ? (
              <p className="text-sm text-white/60">No subtitles found. Try another search.</p>
            ) : null}
            {results?.map((item) => {
              const title =
                item.attributes.release ||
                item.attributes.feature_details?.title ||
                "Untitled release";
              const fileInfo = item.attributes.files?.[0];

              return (
                <div
                  key={item.id}
                  className="rounded-xl border border-white/10 bg-white/5 p-4 text-sm text-white"
                >
                  <h4 className="text-base font-semibold text-white">{title}</h4>
                  <div className="mt-2 flex flex-wrap gap-3 text-xs text-white/70">
                    <span>Language: {item.attributes.language}</span>
                    <span>Downloads: {item.attributes.download_count ?? "-"}</span>
                    <span>
                      Hearing impaired: {item.attributes.hearing_impaired ? "Yes" : "No"}
                    </span>
                  </div>
                  <div className="mt-2 text-xs text-white/60">
                    {fileInfo?.file_name ? `File: ${fileInfo.file_name}` : "File name unavailable"}
                  </div>
                  {fileInfo?.file_size ? (
                    <div className="text-xs text-white/60">
                      Size: {formatBytes(fileInfo.file_size)}
                    </div>
                  ) : null}
                  <div className="mt-3 flex flex-wrap gap-2">
                    {item.downloadLink ? (
                      <a
                        href={item.downloadLink}
                        target="_blank"
                        rel="noreferrer"
                        className="rounded-full border border-white/20 px-3 py-1 text-xs text-white/80 transition hover:bg-white/10"
                      >
                        Download subtitle
                      </a>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleDownload(item)}
                        disabled={isSearching}
                        className="rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs text-white transition hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        Get download link
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <footer className="text-xs text-white/50">
        Built from the original VLSub workflow. This demo uses the OpenSubtitles API and requires
        your own API key.
      </footer>
    </div>
  );
}
