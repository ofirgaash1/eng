import type { Token } from "../types";

export type DisplayToken = {
  token: Token;
  text: string;
};

const NO_SPACE_BEFORE_RE = /^[\)\]\}»”’.,!?;:%…،؛؟。！？]+$/u;
const NO_SPACE_AFTER_RE = /^[\(\[\{«“‘]+$/u;

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

export function buildDisplayTokens(tokens: Token[]): DisplayToken[] {
  const displayTokens: DisplayToken[] = [];
  let prefix = "";

  tokens.forEach((token, index) => {
    const next = tokens[index + 1];

    if (!token.isWord && isNoSpaceAfter(token) && next && isWordLikeToken(next)) {
      prefix += token.text;
      return;
    }

    if (!token.isWord && isNoSpaceBefore(token) && displayTokens.length > 0) {
      displayTokens[displayTokens.length - 1].text += token.text;
      return;
    }

    const text = `${prefix}${token.text}`;
    prefix = "";

    if (text.trim().length === 0) {
      return;
    }

    displayTokens.push({ token, text });
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
    });
  }

  return displayTokens;
}
