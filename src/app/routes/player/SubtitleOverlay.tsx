import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
} from "react";
import type { Cue, Token } from "../../../core/types";
import {
  buildDisplayLines,
  type DisplayToken,
  shouldAddSpaceBefore,
} from "../../../core/subtitles/displayTokens";

const HOVER_OPEN_DELAY_MS = 280;
const HOVER_CLOSE_DELAY_MS = 140;

type HoverTranslatePlacement = "above" | "below";
type HoverTranslateMode = "word" | "cue";
type HoverTranslateStatus = "idle" | "loading" | "success" | "error";

type HoverTranslateState = {
  status: HoverTranslateStatus;
  text: string;
  error: string | null;
};

function createIdleTranslationState(): HoverTranslateState {
  return {
    status: "idle",
    text: "",
    error: null,
  };
}

function useDisplayLines(cue: Cue) {
  return useMemo(() => buildDisplayLines(cue.rawText), [cue.rawText]);
}

type SubtitleTokenButtonProps = {
  displayToken: DisplayToken;
  index: number;
  line: DisplayToken[];
  cue: Cue;
  onTokenClick: (token: Token, cue: Cue) => void;
  onTokenContextMenu: (token: Token, cue: Cue) => void;
  classForToken: (token: Token) => string;
  hoverTranslateEnabled: boolean;
  hoverTranslatePlacement: HoverTranslatePlacement;
  onHoverTranslateWord?: (token: Token, cue: Cue) => Promise<string>;
  onHoverTranslateCue?: (cue: Cue) => Promise<string>;
};

function SubtitleTokenButton({
  displayToken,
  index,
  line,
  cue,
  onTokenClick,
  onTokenContextMenu,
  classForToken,
  hoverTranslateEnabled,
  hoverTranslatePlacement,
  onHoverTranslateWord,
  onHoverTranslateCue,
}: SubtitleTokenButtonProps) {
  const prevToken = index > 0 ? line[index - 1].token : undefined;
  const token = displayToken.token;
  const spacingClass = shouldAddSpaceBefore(prevToken, token) ? "ms-1" : "";
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [popoverMode, setPopoverMode] = useState<HoverTranslateMode>("word");
  const [wordTranslation, setWordTranslation] = useState<HoverTranslateState>(
    createIdleTranslationState,
  );
  const [cueTranslation, setCueTranslation] = useState<HoverTranslateState>(
    createIdleTranslationState,
  );
  const openTimeoutRef = useRef<number | null>(null);
  const closeTimeoutRef = useRef<number | null>(null);

  const clearOpenTimeout = useCallback(() => {
    if (openTimeoutRef.current !== null) {
      window.clearTimeout(openTimeoutRef.current);
      openTimeoutRef.current = null;
    }
  }, []);

  const clearCloseTimeout = useCallback(() => {
    if (closeTimeoutRef.current !== null) {
      window.clearTimeout(closeTimeoutRef.current);
      closeTimeoutRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      clearOpenTimeout();
      clearCloseTimeout();
    };
  }, [clearCloseTimeout, clearOpenTimeout]);

  const loadWordTranslation = useCallback(async () => {
    if (!hoverTranslateEnabled || !token.isWord || !onHoverTranslateWord) {
      return;
    }
    if (wordTranslation.status === "loading" || wordTranslation.status === "success") {
      return;
    }

    setWordTranslation({
      status: "loading",
      text: "",
      error: null,
    });

    try {
      const result = await onHoverTranslateWord(token, cue);
      setWordTranslation({
        status: "success",
        text: result,
        error: null,
      });
    } catch (error) {
      setWordTranslation({
        status: "error",
        text: "",
        error: error instanceof Error ? error.message : "Unable to translate this word.",
      });
    }
  }, [cue, hoverTranslateEnabled, onHoverTranslateWord, token, wordTranslation.status]);

  const loadCueTranslation = useCallback(async () => {
    if (!hoverTranslateEnabled || !onHoverTranslateCue) {
      return;
    }
    if (cueTranslation.status === "loading" || cueTranslation.status === "success") {
      return;
    }

    setCueTranslation({
      status: "loading",
      text: "",
      error: null,
    });

    try {
      const result = await onHoverTranslateCue(cue);
      setCueTranslation({
        status: "success",
        text: result,
        error: null,
      });
    } catch (error) {
      setCueTranslation({
        status: "error",
        text: "",
        error: error instanceof Error ? error.message : "Unable to translate this line.",
      });
    }
  }, [cue, cueTranslation.status, hoverTranslateEnabled, onHoverTranslateCue]);

  const handleHoverStart = useCallback(() => {
    if (!hoverTranslateEnabled || !token.isWord) {
      return;
    }

    clearCloseTimeout();
    if (popoverOpen) {
      return;
    }

    clearOpenTimeout();
    openTimeoutRef.current = window.setTimeout(() => {
      openTimeoutRef.current = null;
      setPopoverMode("word");
      setPopoverOpen(true);
      void loadWordTranslation();
    }, HOVER_OPEN_DELAY_MS);
  }, [
    clearCloseTimeout,
    clearOpenTimeout,
    hoverTranslateEnabled,
    loadWordTranslation,
    popoverOpen,
    token.isWord,
  ]);

  const handleHoverEnd = useCallback(() => {
    if (!hoverTranslateEnabled || !token.isWord) {
      return;
    }

    clearOpenTimeout();
    clearCloseTimeout();
    closeTimeoutRef.current = window.setTimeout(() => {
      closeTimeoutRef.current = null;
      setPopoverOpen(false);
      setPopoverMode("word");
    }, HOVER_CLOSE_DELAY_MS);
  }, [clearCloseTimeout, clearOpenTimeout, hoverTranslateEnabled, token.isWord]);

  const handleTranslateCueClick = useCallback(
    (event: ReactMouseEvent<HTMLButtonElement>) => {
      event.preventDefault();
      event.stopPropagation();
      clearOpenTimeout();
      clearCloseTimeout();
      setPopoverOpen(true);
      setPopoverMode("cue");
      void loadCueTranslation();
    },
    [clearCloseTimeout, clearOpenTimeout, loadCueTranslation],
  );

  const activeTranslation = popoverMode === "cue" ? cueTranslation : wordTranslation;
  const placementClass =
    hoverTranslatePlacement === "below"
      ? "left-1/2 top-full mt-2 -translate-x-1/2"
      : "left-1/2 bottom-full mb-2 -translate-x-1/2";

  const translationText =
    activeTranslation.status === "success"
      ? activeTranslation.text
      : activeTranslation.status === "error"
        ? activeTranslation.error
        : popoverMode === "cue"
          ? "Translating line..."
          : "Translating word...";

  const translationToneClass =
    activeTranslation.status === "error" ? "text-rose-100" : "text-white";

  return (
    <span
      className={`pointer-events-auto relative z-50 inline-flex ${spacingClass}`}
      onMouseEnter={handleHoverStart}
      onMouseLeave={handleHoverEnd}
    >
      <button
        type="button"
        className={`rounded px-0.5 text-left ${
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
      {hoverTranslateEnabled && token.isWord && popoverOpen && (
        <div
          className={`absolute ${placementClass} w-[min(22rem,calc(100vw-2rem))] rounded-xl border border-white/20 bg-slate-950/95 p-3 text-xs text-white shadow-2xl`}
        >
          <div className="flex flex-wrap items-center gap-2">
            <span className={`min-w-0 flex-1 break-words leading-5 ${translationToneClass}`}>
              {translationText}
            </span>
            {popoverMode === "word" && onHoverTranslateCue && (
              <button
                type="button"
                onClick={handleTranslateCueClick}
                className="shrink-0 rounded-full border border-sky-400/40 bg-sky-500/10 px-2 py-1 text-[11px] font-medium text-sky-100 transition hover:bg-sky-500/20"
              >
                Translate line
              </button>
            )}
          </div>
        </div>
      )}
    </span>
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
  hoverTranslateEnabled?: boolean;
  hoverTranslatePlacement?: HoverTranslatePlacement;
  onHoverTranslateWord?: (token: Token, cue: Cue) => Promise<string>;
  onHoverTranslateCue?: (cue: Cue) => Promise<string>;
}

export function SubtitleCue({
  cue,
  onTokenClick,
  onTokenContextMenu,
  classForToken,
  isRtl = false,
  className,
  hoverTranslateEnabled = false,
  hoverTranslatePlacement = "above",
  onHoverTranslateWord,
  onHoverTranslateCue,
}: SubtitleCueProps) {
  const displayLines = useDisplayLines(cue);

  return (
    <div className="pointer-events-none flex flex-col items-center gap-1" dir={isRtl ? "rtl" : "ltr"}>
      {displayLines.map((line, lineIndex) => (
        <div key={`line-${lineIndex}`} className={`pointer-events-none flex flex-wrap ${className ?? ""}`}>
          {line.map((displayToken, index) => (
            <SubtitleTokenButton
              key={`${displayToken.text}-${index}`}
              displayToken={displayToken}
              index={index}
              line={line}
              cue={cue}
              onTokenClick={onTokenClick}
              onTokenContextMenu={onTokenContextMenu}
              classForToken={classForToken}
              hoverTranslateEnabled={hoverTranslateEnabled}
              hoverTranslatePlacement={hoverTranslatePlacement}
              onHoverTranslateWord={onHoverTranslateWord}
              onHoverTranslateCue={onHoverTranslateCue}
            />
          ))}
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
