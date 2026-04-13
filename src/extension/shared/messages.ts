import type { Token, UnknownWord } from "../../core/types";

export type CaptionTrackInfo = {
  baseUrl: string;
  languageCode: string;
  kind?: string;
  name: string;
  vssId?: string;
};

export type PlayerSnapshot = {
  url: string;
  title: string;
  videoId: string;
  captionTracks: CaptionTrackInfo[];
};

export const PAGE_BRIDGE_REQUEST_EVENT = "subtitle-word-tracker-ext:request-player-snapshot";
export const PAGE_BRIDGE_RESPONSE_EVENT = "subtitle-word-tracker-ext:player-snapshot";

export type VocabularyState = {
  words: UnknownWord[];
};

export type SyncStatus = {
  configured: boolean;
  username: string;
  dirty: boolean;
  wordCount: number;
  lastPublishedAt?: number;
  message?: string;
};

export type ExtensionRequest =
  | { type: "GET_VOCABULARY_STATE" }
  | { type: "SAVE_WORD"; token: Token; originalSentence?: string }
  | { type: "TRANSLATE_WORD"; text: string }
  | { type: "GET_SYNC_STATUS" }
  | { type: "SET_SYNC_USERNAME"; username: string }
  | { type: "CREATE_SYNC_USERNAME"; username: string }
  | { type: "SYNC_NOW" };

export type ExtensionSuccess<T> = {
  ok: true;
  data: T;
};

export type ExtensionFailure = {
  ok: false;
  error: string;
};

export type ExtensionResponse<T> = ExtensionSuccess<T> | ExtensionFailure;
