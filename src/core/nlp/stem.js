const suffixes = [
    [/ies$/u, "y"],
    [/ing$/u, ""],
    [/ed$/u, ""],
    [/ly$/u, ""],
    [/es$/u, "e"],
    [/s$/u, ""],
];
export function stem(word) {
    let base = word.toLowerCase().normalize("NFC");
    for (const [pattern, replacement] of suffixes) {
        if (base.length > 4 && pattern.test(base)) {
            base = base.replace(pattern, replacement);
            break;
        }
    }
    return base;
}
//# sourceMappingURL=stem.js.map