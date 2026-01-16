const apiKeyInput = document.getElementById("apiKey");
const fileInput = document.getElementById("videoFile");
const languageSelect = document.getElementById("language");
const searchHashButton = document.getElementById("searchHash");
const searchNameButton = document.getElementById("searchName");
const statusEl = document.getElementById("status");
const resultsEl = document.getElementById("results");

const HASH_CHUNK_SIZE = 64 * 1024;
const API_BASE = "https://api.opensubtitles.com/api/v1";
const DEFAULT_API_KEY = "Er4Y8GbS7JoCcLf9oJmjc2noj2wIsrNu";
const API_CONSUMER_NAME = "ofir gaash v1.0";

const formatBytes = (bytes) => {
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

const setStatus = (message, tone = "neutral", details = "") => {
  statusEl.dataset.tone = tone;
  if (!details) {
    statusEl.textContent = message;
    return;
  }

  statusEl.innerHTML = "";
  const summary = document.createElement("div");
  summary.textContent = message;

  const detailEl = document.createElement("details");
  detailEl.open = true;

  const summaryEl = document.createElement("summary");
  summaryEl.textContent = "Show details";

  const pre = document.createElement("pre");
  pre.textContent = details;

  detailEl.append(summaryEl, pre);
  statusEl.append(summary, detailEl);
};

const clearResults = () => {
  resultsEl.innerHTML = "<p class=\"muted\">Search results will appear here.</p>";
};

const ensureReady = () => {
  if (!apiKeyInput.value.trim()) {
    setStatus("Please enter your OpenSubtitles API key.", "error");
    return false;
  }
  if (!fileInput.files.length) {
    setStatus("Please choose a video file.", "error");
    return false;
  }
  return true;
};

const readChunk = async (file, start, length) => {
  const slice = file.slice(start, start + length);
  const buffer = await slice.arrayBuffer();
  return new DataView(buffer);
};

const sumChunk = (view) => {
  let sum = 0n;
  const length = view.byteLength - (view.byteLength % 8);
  for (let i = 0; i < length; i += 8) {
    sum += view.getBigUint64(i, true);
  }
  return sum;
};

const computeHash = async (file) => {
  const size = file.size;
  const firstChunk = await readChunk(file, 0, HASH_CHUNK_SIZE);
  const lastStart = Math.max(0, size - HASH_CHUNK_SIZE);
  const lastChunk = await readChunk(file, lastStart, HASH_CHUNK_SIZE);
  let hash = BigInt(size);
  hash += sumChunk(firstChunk);
  hash += sumChunk(lastChunk);
  return hash.toString(16).padStart(16, "0");
};

const buildHeaders = () => ({
  "Api-Key": apiKeyInput.value.trim(),
  "Content-Type": "application/json",
  "X-User-Agent": API_CONSUMER_NAME,
});

const describeResponse = async (response) => {
  let bodyText = "";
  try {
    bodyText = await response.text();
  } catch (error) {
    bodyText = `Unable to read response body: ${error.message}`;
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

const renderResults = (items) => {
  if (!items.length) {
    resultsEl.innerHTML = "<p class=\"muted\">No subtitles found. Try another search.</p>";
    return;
  }

  resultsEl.innerHTML = "";

  items.forEach((item) => {
    const card = document.createElement("div");
    card.className = "result-card";

    const title = document.createElement("h3");
    title.textContent = item.attributes.release || item.attributes.feature_details?.title || "Untitled release";

    const meta = document.createElement("div");
    meta.className = "result-meta";
    meta.innerHTML = `
      <span>Language: ${item.attributes.language}</span>
      <span>Downloads: ${item.attributes.download_count ?? "-"}</span>
      <span>Hearing impaired: ${item.attributes.hearing_impaired ? "Yes" : "No"}</span>
    `;

    const fileInfo = item.attributes.files?.[0];

    const actions = document.createElement("div");
    actions.className = "result-actions";

    const fileName = document.createElement("span");
    fileName.className = "muted";
    fileName.textContent = fileInfo?.file_name ? `File: ${fileInfo.file_name}` : "File name unavailable";

    const sizeInfo = document.createElement("span");
    sizeInfo.className = "muted";
    sizeInfo.textContent = fileInfo?.file_size ? `Size: ${formatBytes(fileInfo.file_size)}` : "";

    const downloadButton = document.createElement("button");
    downloadButton.textContent = "Get download link";
    downloadButton.addEventListener("click", async () => {
      if (!fileInfo?.file_id) {
        setStatus("This subtitle entry does not include a file id.", "error");
        return;
      }
      downloadButton.disabled = true;
      downloadButton.textContent = "Preparing download...";
      try {
        const response = await fetch(`${API_BASE}/download`, {
          method: "POST",
          headers: buildHeaders(),
          body: JSON.stringify({ file_id: fileInfo.file_id }),
        });
        if (!response.ok) {
          const details = await describeResponse(response);
          throw new Error(`Download request failed.\n${details}`);
        }
        const payload = await response.json();
        const link = document.createElement("a");
        link.href = payload.link;
        link.textContent = "Download subtitle";
        link.target = "_blank";
        link.rel = "noreferrer";
        link.className = "ghost";
        actions.appendChild(link);
        downloadButton.remove();
        setStatus("Download link ready.", "success");
      } catch (error) {
        const message = error.message || "Download request failed.";
        const [summary, ...rest] = message.split("\n");
        setStatus(summary, "error", rest.join("\n"));
        downloadButton.disabled = false;
        downloadButton.textContent = "Get download link";
      }
    });

    actions.appendChild(downloadButton);
    card.append(title, meta, fileName, sizeInfo, actions);
    resultsEl.appendChild(card);
  });
};

const searchSubtitles = async (params) => {
  clearResults();
  setStatus("Searching OpenSubtitles...", "loading");
  searchHashButton.disabled = true;
  searchNameButton.disabled = true;

  try {
    const url = new URL(`${API_BASE}/subtitles`);
    Object.entries(params).forEach(([key, value]) => {
      if (value) {
        url.searchParams.set(key, value);
      }
    });

    const response = await fetch(url, { headers: buildHeaders() });
    if (!response.ok) {
      const details = await describeResponse(response);
      throw new Error(`Search failed.\n${details}`);
    }
    const payload = await response.json();
    renderResults(payload.data ?? []);
    setStatus(`Found ${payload.total_count ?? payload.data?.length ?? 0} subtitle(s).`, "success");
  } catch (error) {
    const message = error.message || "Search failed.";
    const [summary, ...rest] = message.split("\n");
    setStatus(summary, "error", rest.join("\n"));
    clearResults();
  } finally {
    searchHashButton.disabled = false;
    searchNameButton.disabled = false;
  }
};

searchHashButton.addEventListener("click", async () => {
  if (!ensureReady()) return;
  const file = fileInput.files[0];
  setStatus("Calculating video hash...", "loading");
  try {
    const hash = await computeHash(file);
    await searchSubtitles({
      moviehash: hash,
      moviehash_match: "1",
      languages: languageSelect.value,
    });
  } catch (error) {
    setStatus(`Hash failed: ${error.message}`, "error");
  }
});

searchNameButton.addEventListener("click", async () => {
  if (!ensureReady()) return;
  const file = fileInput.files[0];
  await searchSubtitles({
    query: file.name,
    languages: languageSelect.value,
  });
});

fileInput.addEventListener("change", () => {
  if (fileInput.files.length) {
    setStatus(`Selected ${fileInput.files[0].name}`, "neutral");
  } else {
    setStatus("");
  }
});

clearResults();

apiKeyInput.value = DEFAULT_API_KEY;
