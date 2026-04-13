import styles from "./content.css?inline";
import type { Cue, Token, UnknownWord } from "../../core/types";
import { buildDisplayLines, shouldAddSpaceBefore } from "../../core/subtitles/displayTokens";
import {
  PAGE_BRIDGE_REQUEST_EVENT,
  PAGE_BRIDGE_RESPONSE_EVENT,
  type ExtensionRequest,
  type ExtensionResponse,
  type PlayerSnapshot,
  type VocabularyState,
} from "../shared/messages";
import {
  buildJson3CaptionsUrl,
  chooseBestCaptionTrack,
  parseYouTubeJson3Captions,
} from "../shared/youtubeCaptions";

type VocabularyLookup = {
  exact: Set<string>;
  variants: Set<string>;
};

type NativeCaptionStyle = {
  backgroundColor: string;
  color: string;
  fontFamily: string;
  fontSize: string;
  fontWeight: string;
  letterSpacing: string;
  lineHeight: string;
  textAlign: "left" | "center" | "right";
  textShadow: string;
  textStroke: string;
};

type DomCaptionLine = {
  style?: NativeCaptionStyle;
  text: string;
};

type DomCaptionCue = Cue & {
  lines: DomCaptionLine[];
};

const BRIDGE_SCRIPT_ID = "subtitle-word-tracker-extension-bridge";
const STATUS_VISIBLE_MS = 1800;
const TOOLTIP_OPEN_DELAY_MS = 130;
const CAPTION_WINDOW_SELECTOR = "#ytp-caption-window-container .caption-window";

let host: HTMLDivElement | null = null;
let shadow: ShadowRoot | null = null;
let overlayLines: HTMLDivElement | null = null;
let statusNode: HTMLDivElement | null = null;
let video: HTMLVideoElement | null = null;
let cues: Cue[] = [];
let activeCueKey = "";
let domCue: DomCaptionCue | null = null;
let vocabulary: VocabularyLookup = {
  exact: new Set(),
  variants: new Set(),
};
let lastSnapshotKey = "";
let hoverTimeout: number | null = null;
let statusTimeout: number | null = null;
let lastHiddenCaptionWindow: HTMLElement | null = null;

function isExtensionSuccess<T>(response: ExtensionResponse<T>): response is { ok: true; data: T } {
  return response.ok;
}

async function sendMessage<T>(message: ExtensionRequest): Promise<T> {
  const response = (await chrome.runtime.sendMessage(message)) as ExtensionResponse<T>;
  if (!response || !isExtensionSuccess(response)) {
    throw new Error(response?.error || "Extension request failed.");
  }
  return response.data;
}

function ensureUi() {
  if (host && shadow && overlayLines && statusNode) {
    return;
  }

  host = document.createElement("div");
  host.className = "swt-host";

  shadow = host.attachShadow({ mode: "open" });
  const style = document.createElement("style");
  style.textContent = styles;

  const shell = document.createElement("div");
  shell.className = "swt-shell";

  overlayLines = document.createElement("div");
  overlayLines.className = "swt-overlay";

  const lines = document.createElement("div");
  lines.className = "swt-lines";
  overlayLines.append(lines);

  statusNode = document.createElement("div");
  statusNode.className = "swt-status";
  statusNode.dataset.visible = "false";

  shell.append(overlayLines, statusNode);
  shadow.append(style, shell);
  document.documentElement.append(host);
}

function currentLinesContainer(): HTMLDivElement {
  ensureUi();
  return overlayLines!.firstElementChild as HTMLDivElement;
}

function getCaptionWindow(): HTMLElement | null {
  const captionWindow = document.querySelector(CAPTION_WINDOW_SELECTOR);
  return captionWindow instanceof HTMLElement ? captionWindow : null;
}

function restoreNativeCaptionWindow() {
  if (!lastHiddenCaptionWindow) {
    return;
  }

  lastHiddenCaptionWindow.style.opacity = "";
  lastHiddenCaptionWindow = null;
}

function hideNativeCaptionWindow(captionWindow: HTMLElement | null) {
  if (!captionWindow) {
    restoreNativeCaptionWindow();
    return;
  }

  if (lastHiddenCaptionWindow && lastHiddenCaptionWindow !== captionWindow) {
    restoreNativeCaptionWindow();
  }

  captionWindow.style.opacity = "0";
  lastHiddenCaptionWindow = captionWindow;
}

function updateVocabulary(words: UnknownWord[]) {
  vocabulary = {
    exact: new Set(words.map((word) => word.normalized)),
    variants: new Set(words.map((word) => word.stem)),
  };
  renderActiveCue(true);
}

function tokenClassName(token: Token): string {
  if (vocabulary.exact.has(token.normalized)) {
    return "swt-token swt-token--exact";
  }
  if (vocabulary.variants.has(token.stem)) {
    return "swt-token swt-token--variant";
  }
  return "swt-token";
}

function clearHoverTimeout() {
  if (hoverTimeout !== null) {
    window.clearTimeout(hoverTimeout);
    hoverTimeout = null;
  }
}

function showStatus(text: string) {
  ensureUi();
  if (!statusNode) {
    return;
  }

  statusNode.textContent = text;
  statusNode.dataset.visible = "true";
  if (statusTimeout !== null) {
    window.clearTimeout(statusTimeout);
  }
  statusTimeout = window.setTimeout(() => {
    if (statusNode) {
      statusNode.dataset.visible = "false";
    }
  }, STATUS_VISIBLE_MS);
}

function removeTooltip(button: HTMLButtonElement) {
  const tooltip = button.querySelector(".swt-tooltip");
  if (tooltip) {
    tooltip.remove();
  }
}

function normalizeTextAlign(value: string): NativeCaptionStyle["textAlign"] {
  const nextValue = value.trim().toLowerCase();
  if (nextValue === "left" || nextValue === "right") {
    return nextValue;
  }
  return "center";
}

function readNativeCaptionStyle(
  captionWindow: HTMLElement,
  segment: HTMLElement | null,
): NativeCaptionStyle | undefined {
  if (!segment) {
    return undefined;
  }

  const segmentStyle = window.getComputedStyle(segment);
  const captionWindowStyle = window.getComputedStyle(captionWindow);
  return {
    backgroundColor: segmentStyle.backgroundColor,
    color: segmentStyle.color,
    fontFamily: segmentStyle.fontFamily,
    fontSize: segmentStyle.fontSize,
    fontWeight: segmentStyle.fontWeight,
    letterSpacing: segmentStyle.letterSpacing,
    lineHeight: segmentStyle.lineHeight,
    textAlign: normalizeTextAlign(captionWindowStyle.textAlign),
    textShadow: segmentStyle.textShadow === "none" ? "" : segmentStyle.textShadow,
    textStroke: segmentStyle.getPropertyValue("-webkit-text-stroke").trim(),
  };
}

function applyNativeCaptionStyle(lineNode: HTMLDivElement, lineContent: HTMLDivElement, style?: NativeCaptionStyle) {
  if (!style) {
    lineNode.dataset.align = "center";
    lineContent.dataset.nowrap = "false";
    lineContent.style.backgroundColor = "";
    lineContent.style.color = "";
    lineContent.style.fontFamily = "";
    lineContent.style.fontSize = "";
    lineContent.style.fontWeight = "";
    lineContent.style.letterSpacing = "";
    lineContent.style.lineHeight = "";
    lineContent.style.textShadow = "";
    lineContent.style.setProperty("--swt-text-stroke", "");
    return;
  }

  lineNode.dataset.align = style.textAlign;
  lineContent.dataset.nowrap = "true";
  lineContent.style.backgroundColor = style.backgroundColor;
  lineContent.style.color = style.color;
  lineContent.style.fontFamily = style.fontFamily;
  lineContent.style.fontSize = style.fontSize;
  lineContent.style.fontWeight = style.fontWeight;
  lineContent.style.letterSpacing = style.letterSpacing;
  lineContent.style.lineHeight = style.lineHeight;
  lineContent.style.textShadow = style.textShadow;
  lineContent.style.setProperty("--swt-text-stroke", style.textStroke || "0px transparent");
}

function positionHost() {
  ensureUi();
  const nextVideo = document.querySelector("video");
  if (!(nextVideo instanceof HTMLVideoElement)) {
    if (host) {
      host.style.display = "none";
    }
    video = null;
    return;
  }

  video = nextVideo;
  const rect = nextVideo.getBoundingClientRect();
  if (!host) {
    return;
  }

  const visible = rect.width > 80 && rect.height > 80;
  host.style.display = visible ? "block" : "none";
  if (!visible) {
    return;
  }

  host.style.left = `${rect.left}px`;
  host.style.top = `${rect.top}px`;
  host.style.width = `${rect.width}px`;
  host.style.height = `${rect.height}px`;

  if (domCue) {
    positionOverlayFromCaptionWindow();
  }
}

function createTooltip(button: HTMLButtonElement, text: string) {
  removeTooltip(button);
  const tooltip = document.createElement("div");
  tooltip.className = "swt-tooltip";
  tooltip.textContent = text;
  button.append(tooltip);
}

async function handleTokenHover(button: HTMLButtonElement, token: Token) {
  clearHoverTimeout();
  hoverTimeout = window.setTimeout(async () => {
    try {
      createTooltip(button, "Translating...");
      const result = await sendMessage<{ text: string }>({
        type: "TRANSLATE_WORD",
        text: token.text,
      });
      createTooltip(button, result.text);
    } catch (error) {
      createTooltip(
        button,
        error instanceof Error ? error.message : "Unable to translate this word.",
      );
    }
  }, TOOLTIP_OPEN_DELAY_MS);
}

function buildTokenButton(displayText: string, token: Token, prevToken: Token | undefined, cue: Cue) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = tokenClassName(token);
  button.dataset.spaceBefore = shouldAddSpaceBefore(prevToken, token) ? "true" : "false";

  const text = document.createElement("span");
  text.className = "swt-token-text";
  text.textContent = displayText;
  button.append(text);

  button.addEventListener("click", async () => {
    try {
      const result = await sendMessage<VocabularyState>({
        type: "SAVE_WORD",
        token,
        originalSentence: cue.rawText,
      });
      updateVocabulary(result.words);
      showStatus(`Saved '${token.text}'`);
    } catch (error) {
      showStatus(error instanceof Error ? error.message : "Unable to save word.");
    }
  });

  button.addEventListener("contextmenu", async (event) => {
    event.preventDefault();
    window.open(
      `https://www.google.com/search?q=${encodeURIComponent(`define ${token.text}`)}`,
      "_blank",
      "noopener,noreferrer",
    );
    try {
      const result = await sendMessage<VocabularyState>({
        type: "SAVE_WORD",
        token,
        originalSentence: cue.rawText,
      });
      updateVocabulary(result.words);
      showStatus(`Saved '${token.text}' and opened definition`);
    } catch (error) {
      showStatus(error instanceof Error ? error.message : "Unable to save word.");
    }
  });

  button.addEventListener("mouseenter", () => {
    void handleTokenHover(button, token);
  });
  button.addEventListener("mouseleave", () => {
    clearHoverTimeout();
    removeTooltip(button);
  });

  return button;
}

function renderCues(nextCues: Cue[]) {
  const container = currentLinesContainer();
  container.textContent = "";

  nextCues.forEach((cue) => {
    const cueBlock = document.createElement("div");
    cueBlock.className = "swt-lines";

    const displayLines = buildDisplayLines(cue.rawText);
    displayLines.forEach((line) => {
      const lineNode = document.createElement("div");
      lineNode.className = "swt-line";
      const lineContent = document.createElement("div");
      lineContent.className = "swt-line-content";

      line.forEach((displayToken, index) => {
        const previous = index > 0 ? line[index - 1].token : undefined;
        lineContent.append(
          buildTokenButton(displayToken.text, displayToken.token, previous, cue),
        );
      });

      lineNode.append(lineContent);
      cueBlock.append(lineNode);
    });

    container.append(cueBlock);
  });
}

function renderDomCue(nextCue: DomCaptionCue) {
  const container = currentLinesContainer();
  container.textContent = "";

  const cueBlock = document.createElement("div");
  cueBlock.className = "swt-lines";

  nextCue.lines.forEach((line) => {
    const lineNode = document.createElement("div");
    lineNode.className = "swt-line";

    const lineContent = document.createElement("div");
    lineContent.className = "swt-line-content";
    applyNativeCaptionStyle(lineNode, lineContent, line.style);

    const displayLines = buildDisplayLines(line.text);
    displayLines.forEach((displayLine) => {
      displayLine.forEach((displayToken, index) => {
        const previous = index > 0 ? displayLine[index - 1].token : undefined;
        lineContent.append(
          buildTokenButton(displayToken.text, displayToken.token, previous, nextCue),
        );
      });
    });

    lineNode.append(lineContent);
    cueBlock.append(lineNode);
  });

  container.append(cueBlock);
}

function positionOverlayFromCaptionWindow() {
  if (!video) {
    return;
  }

  const captionWindow = getCaptionWindow();
  const container = currentLinesContainer();
  if (!captionWindow) {
    container.style.position = "";
    container.style.left = "";
    container.style.top = "";
    container.style.width = "";
    container.style.minHeight = "";
    container.style.justifyContent = "";
    return;
  }

  const videoRect = video.getBoundingClientRect();
  const captionRect = captionWindow.getBoundingClientRect();
  container.style.position = "absolute";
  container.style.left = `${Math.max(0, captionRect.left - videoRect.left)}px`;
  container.style.top = `${Math.max(0, captionRect.top - videoRect.top)}px`;
  container.style.width = `${captionRect.width}px`;
  container.style.minHeight = `${captionRect.height}px`;
  container.style.justifyContent = "center";
}

function readCueFromCaptionWindow(): DomCaptionCue | null {
  const captionWindow = getCaptionWindow();
  if (!captionWindow || captionWindow.offsetParent === null) {
    return null;
  }

  const lines = Array.from(captionWindow.querySelectorAll(".caption-visual-line"))
    .map((lineElement): DomCaptionLine | null => {
      const text = lineElement.textContent?.replace(/\u200b/g, "").trim() ?? "";
      if (!text) {
        return null;
      }

      const segment = lineElement.querySelector(".ytp-caption-segment");
      return {
        style:
          segment instanceof HTMLElement ? readNativeCaptionStyle(captionWindow, segment) : undefined,
        text,
      };
    })
    .filter((line): line is DomCaptionLine => line !== null);

  if (lines.length === 0) {
    return null;
  }

  const rawText = lines.map((line) => line.text).join("\n").trim();
  if (!rawText) {
    return null;
  }

  const currentMs = video ? Math.round(video.currentTime * 1000) : 0;
  return {
    index: 0,
    startMs: currentMs,
    endMs: currentMs + 2000,
    lines,
    rawText,
  };
}

function syncCueFromCaptionWindow() {
  const nextCue = readCueFromCaptionWindow();
  const nextKey = nextCue?.rawText ?? "";
  if (nextKey === activeCueKey && Boolean(nextCue) === Boolean(domCue)) {
    if (nextCue) {
      positionOverlayFromCaptionWindow();
    }
    return;
  }

  domCue = nextCue;
  if (domCue) {
    activeCueKey = domCue.rawText;
    renderDomCue(domCue);
    hideNativeCaptionWindow(getCaptionWindow());
    positionOverlayFromCaptionWindow();
    return;
  }

  restoreNativeCaptionWindow();
  activeCueKey = "";
  renderActiveCue();
}

function findActiveCues(currentTimeMs: number): Cue[] {
  return cues.filter((cue) => cue.startMs <= currentTimeMs && cue.endMs >= currentTimeMs);
}

function renderActiveCue(force = false) {
  if (domCue) {
    if (force) {
      renderDomCue(domCue);
    }
    positionOverlayFromCaptionWindow();
    return;
  }

  if (!video) {
    return;
  }

  const activeCues = findActiveCues(video.currentTime * 1000);
  const nextKey = activeCues.map((cue) => `${cue.startMs}:${cue.endMs}`).join("|");
  if (nextKey === activeCueKey && !force) {
    return;
  }

  activeCueKey = nextKey;
  renderCues(activeCues);
}

async function loadCaptions(snapshot: PlayerSnapshot) {
  lastSnapshotKey = [
    snapshot.url,
    ...snapshot.captionTracks.map((track) => `${track.languageCode}:${track.kind ?? ""}:${track.vssId ?? ""}`),
  ].join("|");
  const track = chooseBestCaptionTrack(snapshot.captionTracks);
  if (!track) {
    cues = [];
    activeCueKey = "";
    renderCues([]);
    return;
  }

  const response = await fetch(buildJson3CaptionsUrl(track.baseUrl), {
    credentials: "include",
  });
  if (!response.ok) {
    throw new Error(`Caption request failed with status ${response.status}.`);
  }

  const payload = (await response.json()) as unknown;
  cues = parseYouTubeJson3Captions(payload);
  activeCueKey = "";
  renderActiveCue();
}

function requestPlayerSnapshot() {
  window.dispatchEvent(new CustomEvent(PAGE_BRIDGE_REQUEST_EVENT));
}

function injectPageBridge() {
  if (document.getElementById(BRIDGE_SCRIPT_ID)) {
    return;
  }

  const script = document.createElement("script");
  script.id = BRIDGE_SCRIPT_ID;
  script.src = chrome.runtime.getURL("page-bridge.js");
  script.type = "module";
  (document.head || document.documentElement).append(script);
}

function bindVideoEvents() {
  const attach = () => {
    const nextVideo = document.querySelector("video");
    if (!(nextVideo instanceof HTMLVideoElement) || nextVideo === video) {
      return;
    }

    video = nextVideo;
    ["timeupdate", "seeking", "seeked", "play", "pause", "loadedmetadata"].forEach((event) => {
      nextVideo.addEventListener(event, () => {
        syncCueFromCaptionWindow();
        renderActiveCue();
      });
    });
    positionHost();
    renderActiveCue();
  };

  attach();
  const observer = new MutationObserver(() => attach());
  observer.observe(document.documentElement, { childList: true, subtree: true });
}

function bindCaptionWindowObserver() {
  const observer = new MutationObserver(() => {
    syncCueFromCaptionWindow();
  });

  observer.observe(document.documentElement, {
    childList: true,
    characterData: true,
    subtree: true,
  });
}

function bindRuntimeMessages() {
  chrome.runtime.onMessage.addListener((message: { type?: string; words?: UnknownWord[] }) => {
    if (message?.type === "WORDS_UPDATED" && Array.isArray(message.words)) {
      updateVocabulary(message.words);
    }
  });
}

function bindPageBridge() {
  window.addEventListener(PAGE_BRIDGE_RESPONSE_EVENT, (event: Event) => {
    const customEvent = event as CustomEvent<PlayerSnapshot>;
    const snapshot = customEvent.detail;
    const nextSnapshotKey = [
      snapshot?.url,
      ...(snapshot?.captionTracks ?? []).map(
        (track) => `${track.languageCode}:${track.kind ?? ""}:${track.vssId ?? ""}`,
      ),
    ].join("|");
    if (!snapshot || snapshot.url !== window.location.href || nextSnapshotKey === lastSnapshotKey) {
      return;
    }

    void loadCaptions(snapshot).catch((error) => {
      cues = [];
      activeCueKey = "";
      renderCues([]);
      showStatus(error instanceof Error ? error.message : "Unable to load captions.");
    });
  });

  document.addEventListener("yt-navigate-finish", () => {
    restoreNativeCaptionWindow();
    domCue = null;
    lastSnapshotKey = "";
    requestPlayerSnapshot();
  });
}

async function initializeVocabulary() {
  try {
    const result = await sendMessage<VocabularyState>({ type: "GET_VOCABULARY_STATE" });
    updateVocabulary(result.words);
  } catch (error) {
    showStatus(error instanceof Error ? error.message : "Unable to load vocabulary.");
  }
}

function startLayoutLoop() {
  positionHost();
  window.addEventListener("resize", positionHost, { passive: true });
  window.addEventListener("scroll", positionHost, { passive: true });
  document.addEventListener("fullscreenchange", positionHost);
  window.setInterval(() => {
    positionHost();
    syncCueFromCaptionWindow();
  }, 1000);
}

function main() {
  ensureUi();
  bindRuntimeMessages();
  bindPageBridge();
  bindVideoEvents();
  bindCaptionWindowObserver();
  startLayoutLoop();
  injectPageBridge();
  void initializeVocabulary();
  syncCueFromCaptionWindow();
  window.setTimeout(requestPlayerSnapshot, 250);
}

main();
