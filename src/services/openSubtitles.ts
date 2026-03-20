const API_BASE = "https://api.opensubtitles.com/api/v1";
const API_CONSUMER_NAME = "ofir gaash v1.0";

export const OPEN_SUBTITLES_DEFAULT_API_KEY = "oq1XXcuCnNOnaFDKbknI2pxaQO8TiiU5";
export const OPEN_SUBTITLES_LOCAL_API_KEY = "Er4Y8GbS7JoCcLf9oJmjc2noj2wIsrNu";
export const OPEN_SUBTITLES_FALLBACK_API_KEY = "UVUt5ZRVmROJD7ot9JVJY63n8RTIhxYW";
export const OPEN_SUBTITLES_API_KEYS = Array.from(
  new Set([
    OPEN_SUBTITLES_DEFAULT_API_KEY,
    OPEN_SUBTITLES_LOCAL_API_KEY,
    OPEN_SUBTITLES_FALLBACK_API_KEY,
  ]),
);
const OPEN_SUBTITLES_RATE_LIMIT_DELAY_MS = 1250;

export type OpenSubtitlesFile = {
  file_id: number;
  file_name: string;
  file_size?: number;
};

export type OpenSubtitlesItem = {
  id: string;
  attributes: {
    release?: string;
    language: string;
    download_count?: number;
    hearing_impaired?: boolean;
    feature_details?: {
      title?: string;
    };
    files?: OpenSubtitlesFile[];
  };
};

function buildHeaders(apiKey: string) {
  return {
    "Api-Key": apiKey.trim(),
    "Content-Type": "application/json",
    "X-User-Agent": API_CONSUMER_NAME,
  };
}

export function ensureSrtFileName(name: string | undefined, fallbackId: string) {
  const trimmed = name?.trim() || `subtitle-${fallbackId}`;
  if (/\.srt$/i.test(trimmed)) {
    return trimmed;
  }
  if (/\.[^.\\/]+$/.test(trimmed)) {
    return trimmed.replace(/\.[^.\\/]+$/, ".srt");
  }
  return `${trimmed}.srt`;
}

export function buildPrefixedSubtitleFileName(prefix: string, videoName: string) {
  const baseName = videoName.trim().replace(/\.[^.\\/]+$/, "") || "subtitle";
  return `${prefix}.${baseName}.srt`;
}

export function delay(ms: number) {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

export async function describeOpenSubtitlesResponse(response: Response) {
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
}

export async function searchOpenSubtitlesSubtitles(params: {
  apiKey: string;
  query: string;
  language: string;
}) {
  const url = new URL(`${API_BASE}/subtitles`);
  url.searchParams.set("query", params.query);
  url.searchParams.set("languages", params.language);

  const response = await fetch(url, { headers: buildHeaders(params.apiKey) });
  if (!response.ok) {
    const details = await describeOpenSubtitlesResponse(response);
    throw new Error(`Search failed.\n${details}`);
  }

  const payload = (await response.json()) as {
    data?: OpenSubtitlesItem[];
    total_count?: number;
  };

  return {
    items: payload.data ?? [],
    totalCount: payload.total_count ?? payload.data?.length ?? 0,
  };
}

export function pickMostDownloadedSubtitle(
  items: OpenSubtitlesItem[],
): OpenSubtitlesItem | null {
  const withFiles = items.filter((item) =>
    item.attributes.files?.some((file) => Number.isFinite(file.file_id)),
  );

  if (withFiles.length === 0) {
    return null;
  }

  return [...withFiles].sort((left, right) => {
    return (right.attributes.download_count ?? 0) - (left.attributes.download_count ?? 0);
  })[0] ?? null;
}

export async function downloadOpenSubtitlesSubtitle(params: {
  apiKey: string;
  item: OpenSubtitlesItem;
}) {
  const fileInfo = params.item.attributes.files?.find((file) => Number.isFinite(file.file_id));
  if (!fileInfo?.file_id) {
    throw new Error("This subtitle entry does not include a file id.");
  }

  const response = await fetch(`${API_BASE}/download`, {
    method: "POST",
    headers: buildHeaders(params.apiKey),
    body: JSON.stringify({ file_id: fileInfo.file_id }),
  });
  if (!response.ok) {
    const details = await describeOpenSubtitlesResponse(response);
    throw new Error(`Download request failed.\n${details}`);
  }

  const payload = (await response.json()) as { link?: string; file_name?: string };
  if (!payload.link) {
    throw new Error("Download request succeeded but returned no link.");
  }

  const fileName = ensureSrtFileName(payload.file_name ?? fileInfo.file_name, params.item.id);
  const fileResponse = await fetch(payload.link);
  if (!fileResponse.ok) {
    const details = await describeOpenSubtitlesResponse(fileResponse);
    throw new Error(`Subtitle download failed.\n${details}`);
  }

  return {
    blob: await fileResponse.blob(),
    fileName,
  };
}

export function saveBlobAsDownload(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function getRetryDelayMs(error: unknown): number | null {
  if (!(error instanceof Error)) {
    return null;
  }

  const retryAfterMatch = error.message.match(/Retry-After:\s*(\d+)/i);
  if (retryAfterMatch) {
    const seconds = Number(retryAfterMatch[1]);
    if (Number.isFinite(seconds) && seconds >= 0) {
      return seconds * 1000;
    }
  }

  if (/Status:\s*429\b/i.test(error.message) || /rate limit exceeded/i.test(error.message)) {
    return OPEN_SUBTITLES_RATE_LIMIT_DELAY_MS;
  }

  return null;
}

export async function withOpenSubtitlesApiKeyFallback<T>(
  apiKeys: readonly string[],
  action: (apiKey: string) => Promise<T>,
): Promise<T> {
  const keys = Array.from(new Set(apiKeys.map((key) => key.trim()).filter(Boolean)));
  let lastError: unknown;

  for (const apiKey of keys) {
    try {
      return await action(apiKey);
    } catch (error) {
      lastError = error;
      const retryDelayMs = getRetryDelayMs(error);
      if (retryDelayMs) {
        await delay(retryDelayMs);
      }
    }
  }

  throw (lastError instanceof Error
    ? lastError
    : new Error("No working OpenSubtitles API key is available."));
}
