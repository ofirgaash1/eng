export type WordId = string;

export interface UnknownWord {
  id: WordId;
  original: string;
  originalSentence?: string;
  normalized: string;
  stem: string;
  createdAt: number;
  updatedAt: number;
}

export interface SubtitleFile {
  id: string;
  name: string;
  bytesHash: string;
  totalCues: number;
  language?: string;
  addedAt: number;
}

export interface Cue {
  index: number;
  startMs: number;
  endMs: number;
  rawText: string;
  tokens?: Token[];
}

export interface SubtitleCueRecord extends Cue {
  id: string;
  fileHash: string;
}

export interface Token {
  text: string;
  normalized: string;
  stem: string;
  isWord: boolean;
}

export interface UserPrefs {
  subtitleStyle: {
    fontFamily: string;
    fontSizePx: number;
    secondaryFontSizePx: number;
    useMainForSecondaryFontSize: boolean;
    fontWeight: number;
    color: string;
    outline: boolean;
    shadow: boolean;
    bgColor: string;
    lineHeight: number;
  };
  highlightColors: {
    exact: string;
    variant: string;
  };
  mediaLibrary?: {
    handle?: FileSystemDirectoryHandle;
    label?: string;
    lastPromptedAt?: number;
  };
  lastOpened?: {
    videoName?: string;
    srtName?: string;
  };
}

export interface RecentSessionRecord {
  id: string;
  videoName?: string;
  videoBlob?: Blob;
  subtitleName?: string;
  subtitleText?: string;
  subtitleHash?: string;
  videoTimeSeconds?: number;
  secondarySubtitleName?: string;
  secondarySubtitleText?: string;
  secondarySubtitleHash?: string;
  secondarySubtitleEnabled?: boolean;
  secondarySubtitleOffsetMs?: number;
  updatedAt: number;
}
