import { parseSrt } from "../core/parsing/srtParser";
import { tokenize } from "../core/nlp/tokenize";
const ctx = self;
self.addEventListener("message", (event) => {
    const { id, text } = event.data;
    try {
        const parsed = parseSrt(text).map((cue) => ({
            ...cue,
            tokens: cue.tokens ?? tokenize(cue.rawText),
        }));
        const response = { id, cues: parsed };
        ctx.postMessage(response);
    }
    catch (error) {
        const response = {
            id,
            cues: [],
            error: error instanceof Error ? error.message : "Failed to parse subtitles",
        };
        ctx.postMessage(response);
    }
});
//# sourceMappingURL=srtWorker.js.map