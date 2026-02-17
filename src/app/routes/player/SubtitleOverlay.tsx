import { useMemo } from "react";
import type { Cue, Token } from "../../../core/types";
import {
  buildDisplayTokens,
  isWordLikeToken,
  shouldAddSpaceBefore,
  tokenizeWithItalics,
} from "../../../core/subtitles/displayTokens";

function shouldMoveLeadingPunctuation(token: Token): boolean {
  return !token.isWord && /^[.!?…،؛؟]+$/u.test(token.text);
}

function useDisplayTokens(cue: Cue, isRtl: boolean) {
  const tokens = useMemo(() => tokenizeWithItalics(cue.rawText), [cue.rawText]);
  const normalizedTokens = useMemo(() => {
    if (!isRtl) return tokens;
    const firstWordIndex = tokens.findIndex((token) => isWordLikeToken(token.token));
    if (firstWordIndex <= 0) return tokens;
    const leading = tokens.slice(0, firstWordIndex);
    if (leading.length === 0) return tokens;
    if (leading.every((token) => shouldMoveLeadingPunctuation(token.token))) {
      return [...tokens.slice(firstWordIndex), ...leading];
    }
    return tokens;
  }, [isRtl, tokens]);
  return useMemo(() => buildDisplayTokens(normalizedTokens, { isRtl }), [normalizedTokens, isRtl]);
}

interface SubtitleCueProps {
  cue: Cue;
  onTokenClick: (token: Token, cue: Cue) => void;
  onTokenContextMenu: (token: Token, cue: Cue) => void;
  classForToken: (token: Token) => string;
  isRtl?: boolean;
  className?: string;
}

export function SubtitleCue({
  cue,
  onTokenClick,
  onTokenContextMenu,
  classForToken,
  isRtl = false,
  className,
}: SubtitleCueProps) {
  const displayTokens = useDisplayTokens(cue, isRtl);
  return (
    <div
      className={`pointer-events-none flex flex-wrap ${className ?? ""}`}
      dir={isRtl ? "rtl" : "ltr"}
    >
      {displayTokens.map((displayToken, index) => {
        const prevToken = index > 0 ? displayTokens[index - 1].token : undefined;
        const token = displayToken.token;
        const spacingClass = shouldAddSpaceBefore(prevToken, token) ? "ms-1" : "";
        return (
          <button
            key={`${displayToken.text}-${index}`}
            type="button"
            className={`pointer-events-auto relative z-50 rounded px-0.5 text-left ${spacingClass} ${
              token.isWord ? "focus:outline-none focus-visible:outline-none" : "cursor-default"
            }`}
            onClick={(event) => {
              if (!token.isWord) return;
              onTokenClick(token, cue);
              if (event.currentTarget instanceof HTMLElement) {
                event.currentTarget.blur();
              }
            }}
            onContextMenu={(event) => {
              if (!token.isWord) return;
              event.preventDefault();
              onTokenContextMenu(token, cue);
            }}
            disabled={!token.isWord}
          >
            <span
              className={`rounded px-1 py-0.5 transition-colors ${
                displayToken.italic ? "italic" : ""
              } ${classForToken(token)}`}
            >
              {displayToken.text}
            </span>
          </button>
        );
      })}
    </div>
  );
}

export function SubtitleCueBackground({
  cue,
  isRtl = false,
  className,
}: Pick<SubtitleCueProps, "cue" | "isRtl" | "className">) {
  const displayTokens = useDisplayTokens(cue, isRtl);
  return (
    <div className={`flex flex-wrap ${className ?? ""}`} dir={isRtl ? "rtl" : "ltr"}>
      {displayTokens.map((displayToken, index) => {
        const prevToken = index > 0 ? displayTokens[index - 1].token : undefined;
        const token = displayToken.token;
        const spacingClass = shouldAddSpaceBefore(prevToken, token) ? "ms-1" : "";
        return (
          <span
            key={`${displayToken.text}-${index}`}
            className={`rounded px-1 py-0.5 text-transparent ${spacingClass} ${displayToken.italic ? "italic" : ""}`}
          >
            {displayToken.text}
          </span>
        );
      })}
    </div>
  );
}
