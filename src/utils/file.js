export async function hashBlob(blob, algorithm = "SHA-256") {
    const buffer = await blob.arrayBuffer();
    const digest = await crypto.subtle.digest(algorithm, buffer);
    const hashArray = Array.from(new Uint8Array(digest));
    return hashArray.map((value) => value.toString(16).padStart(2, "0")).join("");
}
//# sourceMappingURL=file.js.map