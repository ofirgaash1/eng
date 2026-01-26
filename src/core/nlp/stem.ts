const suffixes: [RegExp, string][] = [
  [/ies$/u, "y"],
  [/ing$/u, ""],
  [/ed$/u, ""],
  [/ly$/u, ""],
  [/es$/u, "e"],
  [/s$/u, ""],
];

export function stem(word: string): string {
  let base = word.toLowerCase().normalize("NFC");
  base = base.replace(/['’](s|d)$/u, "");
  base = base.replace(/['’]$/u, "");
  for (const [pattern, replacement] of suffixes) {
    if (base.length > 4 && pattern.test(base)) {
      if (pattern.source === "s$" && (base.endsWith("ness") || base.endsWith("ss"))) {
        continue;
      }
      base = base.replace(pattern, replacement);
      break;
    }
  }
  return base;
}
