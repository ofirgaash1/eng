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

const NO_SPACE_BEFORE_CHAR_RE =
  /[)"'\]\}\u05F3\u05F4\u00BB\u201D\u2019\u02BC.,!?;:%\u2026\u060C\u061B\u061F\u3002\uFF01\uFF1F]/u;
const NO_SPACE_AFTER_CHAR_RE =
  /["'(\[\{\u05F3\u05F4\u00AB\u201C\u2018\u2019\u02BC]/u;
const DIALOGUE_DASH_RE = /^[-\u2013\u2014]+$/u;
const PREFIX_JOINER_CHAR_RE = /[$\u20AA\u20AC\u00A3\u00A5#+]/u;
const RTL_TEXT_RE = /[\u0591-\u07FF\uFB1D-\uFDFD\uFE70-\uFEFC]/u;

function tokenCharsMatch(text: string, matcher: RegExp): boolean {
  return [...text].every((char) => matcher.test(char));
}

export function isWordLikeToken(token: Token): boolean {
  return token.isWord || /^\d+$/.test(token.text);
}

function isNoSpaceBefore(token: Token): boolean {
  return !token.isWord && tokenCharsMatch(token.text, NO_SPACE_BEFORE_CHAR_RE);
}

function isNoSpaceAfter(token: Token): boolean {
  return !token.isWord && tokenCharsMatch(token.text, NO_SPACE_AFTER_CHAR_RE);
}

function isDialogueDash(token: Token): boolean {
  return !token.isWord && DIALOGUE_DASH_RE.test(token.text);
}

function isPrefixJoiner(token: Token): boolean {
  return !token.isWord && tokenCharsMatch(token.text, PREFIX_JOINER_CHAR_RE);
}

function isNumericToken(token: Token): boolean {
  return !token.isWord && /^\d+$/u.test(token.text);
}

function isNumericJoiner(token: Token): boolean {
  return !token.isWord && /^[,.:/]$/u.test(token.text);
}

function lineContainsRtl(tokens: StyledToken[]): boolean {
  return tokens.some(({ token }) => RTL_TEXT_RE.test(token.text));
}

function splitDisplayPunctuationToken(token: Token): Token[] {
  if (token.isWord || /^\d+$/u.test(token.text) || token.text.length <= 1) {
    return [token];
  }

  return [...token.text].map((char) => ({
    text: char,
    normalized: char,
    stem: char,
    isWord: false,
  }));
}

function normalizeCompensatedRtlPunctuation(tokens: StyledToken[], rtlContext: boolean): StyledToken[] {
  if (!rtlContext && !lineContainsRtl(tokens)) return tokens;

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
        const chunkTokens = tokenize(linePart).flatMap(splitDisplayPunctuationToken);
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
      (((isNoSpaceAfter(token.token) || isPrefixJoiner(token.token)) &&
        (prefix.length > 0 || !previous || (next ? isWordLikeToken(next.token) : false))) ||
        (isDialogueDash(token.token) && (!previous || !isWordLikeToken(previous.token))))
    ) {
      prefix += token.token.text;
      prefixItalic = prefixItalic || token.italic;
      return;
    }

    if (!token.token.isWord && isNoSpaceBefore(token.token) && displayTokens.length > 0) {
      const lastToken = displayTokens[displayTokens.length - 1];
      if (prefix.trim().length > 0) {
        lastToken.text += prefix;
        lastToken.italic = lastToken.italic || prefixItalic;
        prefix = "";
        prefixItalic = false;
      }
      lastToken.text += token.token.text;
      lastToken.italic = lastToken.italic || token.italic;
      return;
    }

    if (
      isNumericToken(token.token) &&
      previous &&
      isNumericJoiner(previous.token) &&
      displayTokens.length > 0 &&
      /\d[,.:/]?$/u.test(displayTokens[displayTokens.length - 1].text)
    ) {
      const lastToken = displayTokens[displayTokens.length - 1];
      lastToken.text += token.token.text;
      lastToken.token = token.token;
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
  const rtlContext = RTL_TEXT_RE.test(text);
  return tokenizeLinesWithItalics(text).map((line) =>
    buildDisplayTokens(normalizeCompensatedRtlPunctuation(line, rtlContext)),
  );
}
