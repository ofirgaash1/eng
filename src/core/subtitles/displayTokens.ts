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

const NO_SPACE_BEFORE_RE = /^[\)\]\}»”’.,!?;:%…،؛؟。！？]+$/u;
const NO_SPACE_AFTER_RE = /^[\(\[\{«“‘]+$/u;
const RTL_PREFIX_PUNCT_RE = /^[.]+$/u;

export function isWordLikeToken(token: Token): boolean {
  return token.isWord || /^\d+$/.test(token.text);
}

function isNoSpaceBefore(token: Token): boolean {
  return !token.isWord && NO_SPACE_BEFORE_RE.test(token.text);
}

function isNoSpaceAfter(token: Token): boolean {
  return !token.isWord && NO_SPACE_AFTER_RE.test(token.text);
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
  const markerPattern = new RegExp(`(${ITALIC_START}|${ITALIC_END})`, "g");
  const parts = text.split(markerPattern).filter((part) => part.length > 0);
  let italic = false;
  const tokens: StyledToken[] = [];

  for (const part of parts) {
    if (part === ITALIC_START) {
      italic = true;
      continue;
    }
    if (part === ITALIC_END) {
      italic = false;
      continue;
    }
    const chunkTokens = tokenize(part);
    tokens.push(...chunkTokens.map((token) => ({ token, italic })));
  }

  return tokens;
}

export function buildDisplayTokens(
  tokens: StyledToken[],
  options: { isRtl?: boolean } = {},
): DisplayToken[] {
  const { isRtl = false } = options;
  const displayTokens: DisplayToken[] = [];
  let prefix = "";
  let prefixItalic = false;

  tokens.forEach((token, index) => {
    const next = tokens[index + 1];

    if (
      isRtl &&
      !token.token.isWord &&
      RTL_PREFIX_PUNCT_RE.test(token.token.text) &&
      next &&
      isWordLikeToken(next.token)
    ) {
      prefix += token.token.text;
      prefixItalic = prefixItalic || token.italic;
      return;
    }

    if (!token.token.isWord && isNoSpaceAfter(token.token) && next && isWordLikeToken(next.token)) {
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
