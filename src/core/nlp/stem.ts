const APOSTROPHE_SUFFIX = /['\u2019\u02BC](s|d)$/u;
const APOSTROPHE_TRAIL = /['\u2019\u02BC]$/u;
const VOWELS = new Set(["a", "e", "i", "o", "u"]);
const S_SUFFIX_EXCEPTIONS = ["ness", "ss", "ous", "us", "is"];
const IES_OVERRIDES = new Map<string, string>([["boonies", "boonie"]]);

function hasVowel(word: string): boolean {
  return /[aeiouy]/u.test(word);
}

function isVowel(letter: string): boolean {
  return VOWELS.has(letter);
}

function endsWithDoubleConsonant(word: string): boolean {
  if (word.length < 2) return false;
  const last = word[word.length - 1];
  const prev = word[word.length - 2];
  return last === prev && !isVowel(last);
}

function shouldRestoreEForLe(word: string): boolean {
  if (word.length < 3 || !word.endsWith("l")) return false;
  const prev = word[word.length - 2];
  const prevPrev = word[word.length - 3];
  return prev === prevPrev && !isVowel(prev);
}

function normalizeVerbStem(stem: string): string {
  if (stem.endsWith("at") || stem.endsWith("bl") || stem.endsWith("iz")) {
    return `${stem}e`;
  }

  let next = stem;
  if (endsWithDoubleConsonant(next) && !["l", "s", "z"].includes(next[next.length - 1])) {
    next = next.slice(0, -1);
  }

  if (shouldRestoreEForLe(next)) {
    return `${next}e`;
  }

  return next;
}

export function stem(word: string): string {
  let base = word.toLowerCase().normalize("NFC");
  base = base.replace(APOSTROPHE_SUFFIX, "");
  base = base.replace(APOSTROPHE_TRAIL, "");

  if (base.length <= 3) {
    return base;
  }

  if (base.endsWith("ier") && base.length > 5) {
    const before = base.slice(0, -3);
    const last = before[before.length - 1];
    const prev = before[before.length - 2];
    if (last && prev && last === prev && !isVowel(last)) {
      return `${before}y`;
    }
  }

  if (base.endsWith("ied") && base.length > 3) {
    const root = base.slice(0, -3);
    return base.length <= 4 ? `${root}ie` : `${root}y`;
  }

  if (base.endsWith("ies") && base.length > 3) {
    const override = IES_OVERRIDES.get(base);
    if (override) {
      return override;
    }
    const root = base.slice(0, -3);
    return base.length <= 4 ? `${root}ie` : `${root}y`;
  }

  if (base.endsWith("ing") && !base.endsWith("thing")) {
    const root = base.slice(0, -3);
    if (root.length >= 3 && hasVowel(root)) {
      return normalizeVerbStem(root);
    }
  }

  if (base.endsWith("ed")) {
    const root = base.slice(0, -2);
    if (root.length >= 2 && hasVowel(root)) {
      const normalized = normalizeVerbStem(root);
      if (base.endsWith("sed") && (normalized.endsWith("s") || normalized.endsWith("us") || normalized.endsWith("os"))) {
        return `${normalized}e`;
      }
      if (base.endsWith("ured") && normalized.endsWith("ur")) {
        return `${normalized}e`;
      }
      if (normalized.endsWith("ok")) {
        return `${normalized}e`;
      }
      if (normalized.endsWith("g") && !normalized.endsWith("ng") && !root.endsWith("gg")) {
        return `${normalized}e`;
      }
      return normalized;
    }
  }

  if (base.endsWith("ically") && base.length > 7) {
    return base.replace(/ically$/u, "ic");
  }

  if (base.endsWith("ly") && base.length > 4) {
    const before = base[base.length - 3];
    if (before && !isVowel(before)) {
      return base.slice(0, -2);
    }
  }

  if (base.endsWith("ves") && base.length > 4) {
    return `${base.slice(0, -3)}f`;
  }

  if (base.endsWith("es") && base.length > 4) {
    if (
      base.endsWith("ches") ||
      base.endsWith("shes") ||
      base.endsWith("xes") ||
      base.endsWith("zes")
    ) {
      return base.slice(0, -2);
    }
    return base.slice(0, -1);
  }

  if (base.endsWith("s") && base.length > 4) {
    if (!S_SUFFIX_EXCEPTIONS.some((suffix) => base.endsWith(suffix))) {
      return base.slice(0, -1);
    }
  }

  return base;
}
