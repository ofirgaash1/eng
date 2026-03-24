import { useMemo } from "react";
import type { Cue, Token } from "../../../core/types";
import {
  buildDisplayLines,
  type DisplayToken,
  shouldAddSpaceBefore,
} from "../../../core/subtitles/displayTokens";

function useDisplayLines(cue: Cue) {
  return useMemo(() => buildDisplayLines(cue.rawText), [cue.rawText]);
}

function renderTokenButton(
  displayToken: DisplayToken,
  index: number,
  line: DisplayToken[],
  cue: Cue,
  onTokenClick: (token: Token, cue: Cue) => void,
  onTokenContextMenu: (token: Token, cue: Cue) => void,
  classForToken: (token: Token) => string,
) {
  const prevToken = index > 0 ? line[index - 1].token : undefined;
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
      <bdi
        dir="auto"
        className={`rounded px-1 py-0.5 transition-colors ${displayToken.italic ? "italic" : ""} ${classForToken(token)}`}
      >
        {displayToken.text}
      </bdi>
    </button>
  );
}

function renderTokenBackground(displayToken: DisplayToken, index: number, line: DisplayToken[]) {
  const prevToken = index > 0 ? line[index - 1].token : undefined;
  const token = displayToken.token;
  const spacingClass = shouldAddSpaceBefore(prevToken, token) ? "ms-1" : "";

  return (
    <bdi
      key={`${displayToken.text}-${index}`}
      dir="auto"
      className={`rounded px-1 py-0.5 text-transparent ${spacingClass} ${displayToken.italic ? "italic" : ""}`}
    >
      {displayToken.text}
    </bdi>
  );
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
  const displayLines = useDisplayLines(cue);

  return (
    <div className="pointer-events-none flex flex-col items-center gap-1" dir={isRtl ? "rtl" : "ltr"}>
      {displayLines.map((line, lineIndex) => (
        <div key={`line-${lineIndex}`} className={`pointer-events-none flex flex-wrap ${className ?? ""}`}>
          {line.map((displayToken, index) =>
            renderTokenButton(
              displayToken,
              index,
              line,
              cue,
              onTokenClick,
              onTokenContextMenu,
              classForToken,
            ),
          )}
        </div>
      ))}
    </div>
  );
}

export function SubtitleCueBackground({
  cue,
  isRtl = false,
  className,
}: Pick<SubtitleCueProps, "cue" | "isRtl" | "className">) {
  const displayLines = useDisplayLines(cue);

  return (
    <div className="flex flex-col items-center gap-1" dir={isRtl ? "rtl" : "ltr"}>
      {displayLines.map((line, lineIndex) => (
        <div key={`line-${lineIndex}`} className={`flex flex-wrap ${className ?? ""}`}>
          {line.map((displayToken, index) => renderTokenBackground(displayToken, index, line))}
        </div>
      ))}
    </div>
  );
}
