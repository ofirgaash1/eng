import {
  PAGE_BRIDGE_REQUEST_EVENT,
  PAGE_BRIDGE_RESPONSE_EVENT,
  type CaptionTrackInfo,
  type PlayerSnapshot,
} from "../shared/messages";

declare global {
  interface Window {
    ytInitialPlayerResponse?: unknown;
    ytplayer?: {
      config?: {
        args?: Record<string, string | undefined>;
      };
    };
  }
}

type PlayerResponse = {
  videoDetails?: {
    videoId?: string;
    title?: string;
  };
  captions?: {
    playerCaptionsTracklistRenderer?: {
      captionTracks?: Array<{
        baseUrl?: string;
        languageCode?: string;
        kind?: string;
        vssId?: string;
        name?: {
          simpleText?: string;
          runs?: Array<{ text?: string }>;
        };
      }>;
    };
  };
};

function safeParseJson<T>(value: string | undefined): T | undefined {
  if (!value) {
    return undefined;
  }

  try {
    return JSON.parse(value) as T;
  } catch {
    return undefined;
  }
}

function getPlayerResponse(): PlayerResponse | undefined {
  const direct = window.ytInitialPlayerResponse as PlayerResponse | undefined;
  if (direct) {
    return direct;
  }

  const args = window.ytplayer?.config?.args;
  return (
    safeParseJson<PlayerResponse>(args?.raw_player_response) ||
    safeParseJson<PlayerResponse>(args?.player_response)
  );
}

function readTrackName(
  track: NonNullable<
    NonNullable<
      NonNullable<PlayerResponse["captions"]>["playerCaptionsTracklistRenderer"]
    >["captionTracks"]
  >[number],
) {
  if (typeof track.name?.simpleText === "string" && track.name.simpleText.trim()) {
    return track.name.simpleText.trim();
  }

  const runs = Array.isArray(track.name?.runs) ? track.name.runs : [];
  const text = runs.map((run) => run.text ?? "").join("").trim();
  return text || track.languageCode || "Unknown";
}

function extractCaptionTracks(response: PlayerResponse | undefined): CaptionTrackInfo[] {
  const tracks = response?.captions?.playerCaptionsTracklistRenderer?.captionTracks ?? [];

  return tracks
    .filter(
      (track): track is typeof track & { baseUrl: string; languageCode: string } =>
        typeof track.baseUrl === "string" &&
        track.baseUrl.length > 0 &&
        typeof track.languageCode === "string" &&
        track.languageCode.length > 0,
    )
    .map((track) => ({
      baseUrl: track.baseUrl,
      languageCode: track.languageCode,
      kind: track.kind,
      name: readTrackName(track),
      vssId: track.vssId,
    }));
}

function buildSnapshot(): PlayerSnapshot {
  const response = getPlayerResponse();
  return {
    url: window.location.href,
    title: response?.videoDetails?.title ?? document.title,
    videoId: response?.videoDetails?.videoId ?? "",
    captionTracks: extractCaptionTracks(response),
  };
}

function dispatchSnapshot() {
  window.dispatchEvent(
    new CustomEvent<PlayerSnapshot>(PAGE_BRIDGE_RESPONSE_EVENT, {
      detail: buildSnapshot(),
    }),
  );
}

window.addEventListener(PAGE_BRIDGE_REQUEST_EVENT, dispatchSnapshot);
document.addEventListener("yt-navigate-finish", () => {
  window.setTimeout(dispatchSnapshot, 150);
});
window.setTimeout(dispatchSnapshot, 0);
