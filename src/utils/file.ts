export async function hashBlob(blob: Blob, algorithm: AlgorithmIdentifier = "SHA-256"): Promise<string> {
  const buffer = await blob.arrayBuffer();
  const digest = await crypto.subtle.digest(algorithm, buffer);
  const hashArray = Array.from(new Uint8Array(digest));
  return hashArray.map((value) => value.toString(16).padStart(2, "0")).join("");
}

export async function readSubtitleText(file: Blob): Promise<string> {
  const buffer = await file.arrayBuffer();
  if (buffer.byteLength >= 2) {
    const view = new Uint8Array(buffer);
    if (view[0] === 0xff && view[1] === 0xfe) {
      return new TextDecoder("utf-16le").decode(buffer);
    }
    if (view[0] === 0xfe && view[1] === 0xff) {
      return new TextDecoder("utf-16be").decode(buffer);
    }
    if (buffer.byteLength >= 3 && view[0] === 0xef && view[1] === 0xbb && view[2] === 0xbf) {
      return new TextDecoder("utf-8").decode(buffer);
    }
  }
  const utf8Decoder = new TextDecoder("utf-8", { fatal: true });
  try {
    return utf8Decoder.decode(buffer);
  } catch {
    const hebrewDecoder = new TextDecoder("windows-1255");
    return hebrewDecoder.decode(buffer);
  }
}
