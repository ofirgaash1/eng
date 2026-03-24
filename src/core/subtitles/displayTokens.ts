import type { Token } from "../types";
import { tokenize } from "../nlp/tokenize";
import { ITALIC_END, ITALIC_START } from "../parsing/srtParser";

export type StyledToken = {
  token: Token;
  italic: boolean;
};

export type DisplayToken = {
  token: Token;
  text: string;
  italic: boolean;
};

const NO_SPACE_BEFORE_RE = /^[)"\]\}\u05F3\u05F4»”’.,!?;:%…،؛؟。！？]+$/u;
const NO_SPACE_AFTER_RE = /^["(\[\{\u05F3\u05F4«“‘]+$/u;
const DIALOGUE_DASH_RE = /^[-–—]+$/u;
const RTL_TEXT_RE = /[\u0591-\u07FF\uFB1D-\uFDFD\uFE70-\uFEFC]/u;

export function isWordLikeToken(token: Token): boolean {
  return token.isWord || /^\d+$/.test(token.text);
}

function isNoSpaceBefore(token: Token): boolean {
  return !token.isWord && NO_SPACE_BEFORE_RE.test(token.text);
}

function isNoSpaceAfter(token: Token): boolean {
  return !token.isWord && NO_SPACE_AFTER_RE.test(token.text);
}

function isDialogueDash(token: Token): boolean {
  return !token.isWord && DIALOGUE_DASH_RE.test(token.text);
}

function lineContainsRtl(tokens: StyledToken[]): boolean {
  return tokens.some(({ token }) => RTL_TEXT_RE.test(token.text));
}

function normalizeCompensatedRtlPunctuation(tokens: StyledToken[]): StyledToken[] {
  if (!lineContainsRtl(tokens)) return tokens;

  let leadingCount = 0;
  while (leadingCount < tokens.length && isNoSpaceBefore(tokens[leadingCount].token)) {
    leadingCount += 1;
  }

  let trailingStart = tokens.length;
  while (trailingStart > leadingCount && isNoSpaceAfter(tokens[trailingStart - 1].token)) {
    trailingStart -= 1;
  }

  if (leadingCount === 0 && trailingStart === tokens.length) {
    return tokens;
  }

  return [
    ...tokens.slice(trailingStart),
    ...tokens.slice(leadingCount, trailingStart),
    ...tokens.slice(0, leadingCount),
  ];
}

export function shouldAddSpaceBefore(prev: Token | undefined, next: Token): boolean {
  if (!prev) return false;
  if (isNoSpaceBefore(next)) return false;
  if (isNoSpaceAfter(prev)) return false;

  const prevIsWordLike = isWordLikeToken(prev);
  const nextIsWordLike = isWordLikeToken(next);

  if (prevIsWordLike && nextIsWordLike) return true;
  if (prevIsWordLike && !nextIsWordLike) return true;
  if (!prevIsWordLike && nextIsWordLike) return true;

  return false;
}

export function tokenizeWithItalics(text: string): StyledToken[] {
  return tokenizeLinesWithItalics(text).flat();
}

export function tokenizeLinesWithItalics(text: string): StyledToken[][] {
  const markerPattern = new RegExp(`(${ITALIC_START}|${ITALIC_END})`, "g");
  const parts = text.split(markerPattern).filter((part) => part.length > 0);
  let italic = false;
  const lines: StyledToken[][] = [[]];

  for (const part of parts) {
    if (part === ITALIC_START) {
      italic = true;
      continue;
    }
    if (part === ITALIC_END) {
      italic = false;
      continue;
    }

    const lineParts = part.split(/\r?\n/);
    lineParts.forEach((linePart, index) => {
      if (linePart.length > 0) {
        const chunkTokens = tokenize(linePart);
        lines[lines.length - 1].push(...chunkTokens.map((token) => ({ token, italic })));
      }

      if (index < lineParts.length - 1) {
        lines.push([]);
      }
    });
  }

  return lines;
}

export function buildDisplayTokens(tokens: StyledToken[]): DisplayToken[] {
  const displayTokens: DisplayToken[] = [];
  let prefix = "";
  let prefixItalic = false;

  tokens.forEach((token, index) => {
    const previous = index > 0 ? tokens[index - 1] : undefined;
    const next = tokens[index + 1];

    if (
      !token.token.isWord &&
      next &&
      isWordLikeToken(next.token) &&
      (isNoSpaceAfter(token.token) ||
        (isDialogueDash(token.token) && (!previous || !isWordLikeToken(previous.token))))
    ) {
      prefix += token.token.text;
      prefixItalic = prefixItalic || token.italic;
      return;
    }

    if (!token.token.isWord && isNoSpaceBefore(token.token) && displayTokens.length > 0) {
      const lastToken = displayTokens[displayTokens.length - 1];
      lastToken.text += token.token.text;
      lastToken.italic = lastToken.italic || token.italic;
      return;
    }

    const text = `${prefix}${token.token.text}`;
    const italic = prefixItalic || token.italic;
    prefix = "";
    prefixItalic = false;

    if (text.trim().length === 0) {
      return;
    }

    displayTokens.push({ token: token.token, text, italic });
  });

  if (prefix.trim().length > 0) {
    const text = prefix.trim();
    displayTokens.push({
      token: {
        text,
        normalized: text,
        stem: text,
        isWord: false,
      },
      text,
      italic: prefixItalic,
    });
  }

  return displayTokens;
}

export function buildDisplayLines(text: string): DisplayToken[][] {
  return tokenizeLinesWithItalics(text).map((line) =>
    buildDisplayTokens(normalizeCompensatedRtlPunctuation(line)),
  );
}
