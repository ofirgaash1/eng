import fs from "node:fs";
import path from "node:path";
import { gzipSync } from "node:zlib";

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(2)} ${units[unitIndex]}`;
}

function percent(saved, total) {
  if (total === 0) return "0.00";
  return ((saved / total) * 100).toFixed(2);
}

function usage() {
  console.log(
    [
      "Usage:",
      "  node scripts/compact-backup.mjs <input.json> [output.json] [--keep-cue-tokens] [--gzip]",
      "  npm run backup:compact -- <input.json> [output.json]",
      "",
      "Defaults:",
      "  output.json = <input>.compact.json",
      "  cue tokens are stripped by default for much smaller files",
    ].join("\n")
  );
}

const args = process.argv.slice(2);
if (args.length === 0 || args.includes("-h") || args.includes("--help")) {
  usage();
  process.exit(args.length === 0 ? 1 : 0);
}

const flags = new Set(args.filter((arg) => arg.startsWith("--")));
const positional = args.filter((arg) => !arg.startsWith("--"));

const inputPath = positional[0];
const outputPath =
  positional[1] ??
  path.join(
    path.dirname(inputPath),
    `${path.basename(inputPath, path.extname(inputPath))}.compact.json`
  );

const keepCueTokens = flags.has("--keep-cue-tokens");
const writeGzip = flags.has("--gzip");

const raw = fs.readFileSync(inputPath, "utf8");
const payload = JSON.parse(raw);

if (!payload || typeof payload !== "object") {
  throw new Error("Backup file must contain a JSON object.");
}

const data =
  payload && typeof payload === "object" && payload.data && typeof payload.data === "object"
    ? payload.data
    : payload;

let cueCount = 0;
let tokenCount = 0;
if (!keepCueTokens && Array.isArray(data.subtitleCues)) {
  data.subtitleCues = data.subtitleCues.map((cue) => {
    cueCount += 1;
    if (Array.isArray(cue?.tokens)) {
      tokenCount += cue.tokens.length;
    }
    if (!cue || typeof cue !== "object") {
      return cue;
    }
    const { tokens, ...rest } = cue;
    return rest;
  });
}

const compact = JSON.stringify(payload);
fs.writeFileSync(outputPath, compact);

const originalBytes = Buffer.byteLength(raw);
const compactBytes = Buffer.byteLength(compact);
const savedBytes = originalBytes - compactBytes;

console.log(`Input:  ${inputPath}`);
console.log(`Output: ${outputPath}`);
console.log(
  `Size:   ${formatBytes(originalBytes)} -> ${formatBytes(compactBytes)} (saved ${formatBytes(savedBytes)}, ${percent(savedBytes, originalBytes)}%)`
);

if (!keepCueTokens) {
  console.log(`Cues compacted: ${cueCount.toLocaleString()} (tokens removed: ${tokenCount.toLocaleString()})`);
}

if (writeGzip) {
  const gzPath = `${outputPath}.gz`;
  const gzBuffer = gzipSync(compact, { level: 9 });
  fs.writeFileSync(gzPath, gzBuffer);
  const gzBytes = gzBuffer.byteLength;
  console.log(`Gzip:   ${gzPath} (${formatBytes(gzBytes)})`);
}
