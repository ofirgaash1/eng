import { parseSrt } from "../core/parsing/srtParser";
import { tokenize } from "../core/nlp/tokenize";
import type { Cue } from "../core/types";

interface ParseRequest {
  id: string;
  text: string;
}

interface ParseResponse {
  id: string;
  cues: Cue[];
  error?: string;
}

const ctx = self as unknown as { postMessage: (message: ParseResponse) => void };

self.addEventListener("message", (event: MessageEvent<ParseRequest>) => {
  const { id, text } = event.data;
  try {
    const parsed = parseSrt(text).map((cue) => ({
      ...cue,
      tokens: cue.tokens ?? tokenize(cue.rawText),
    }));
    const response: ParseResponse = { id, cues: parsed };
    ctx.postMessage(response);
  } catch (error) {
    const response: ParseResponse = {
      id,
      cues: [],
      error: error instanceof Error ? error.message : "Failed to parse subtitles",
    };
    ctx.postMessage(response);
  }
});

export {};
