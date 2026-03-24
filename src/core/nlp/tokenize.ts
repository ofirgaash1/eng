import { stem } from "./stem";
import type { Token } from "../types";

const WORD_JOINER_PATTERN = `['"\\u05F3\\u05F4\\u2019\\u02BC-]`;
const WORD_PATTERN = new RegExp(
  `(\\p{L}+(?:${WORD_JOINER_PATTERN}\\p{L}+)*)|(\\d+)|([^\\s\\p{L}\\d]+)`,
  "gu",
);

export function tokenize(text: string): Token[] {
  const sanitized = text.replace(/[\u0001\u0002]/g, "");
  const tokens: Token[] = [];
  let match: RegExpExecArray | null;

  while ((match = WORD_PATTERN.exec(sanitized))) {
    const [raw, word, numeric, punct] = match;
    if (word) {
      const normalized = word.toLowerCase().normalize("NFC");
      tokens.push({
        text: raw,
        normalized,
        stem: stem(normalized),
        isWord: true,
      });
    } else if (numeric) {
      tokens.push({
        text: raw,
        normalized: numeric,
        stem: numeric,
        isWord: false,
      });
    } else if (punct) {
      tokens.push({
        text: raw,
        normalized: punct,
        stem: punct,
        isWord: false,
      });
    }
  }

  return tokens.length > 0
    ? tokens
    : [
        {
          text,
          normalized: text,
          stem: text,
          isWord: /\p{L}/u.test(text),
        },
      ];
}
