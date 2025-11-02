const TIME_REGEX = /(\d{2}:\d{2}:\d{2},\d{3}) --> (\d{2}:\d{2}:\d{2},\d{3})/;
function toMs(timecode) {
    const [hours, minutes, rest] = timecode.split(":");
    const [seconds, milliseconds] = rest.split(",");
    return (Number(hours) * 3600 * 1000 +
        Number(minutes) * 60 * 1000 +
        Number(seconds) * 1000 +
        Number(milliseconds));
}
export function parseSrt(text) {
    return text
        .split(/\r?\n\r?\n/)
        .filter(Boolean)
        .map((block, index) => {
        const [maybeIndex, times, ...textLines] = block.split(/\r?\n/);
        const match = times?.match(TIME_REGEX);
        const start = match?.[1] ?? "00:00:00,000";
        const end = match?.[2] ?? "00:00:00,000";
        return {
            index: Number.parseInt(maybeIndex ?? String(index), 10),
            startMs: toMs(start),
            endMs: toMs(end),
            rawText: textLines.join(" \n"),
        };
    });
}
//# sourceMappingURL=srtParser.js.map