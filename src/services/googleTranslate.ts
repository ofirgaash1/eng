const RAW_GOOGLE_TRANSLATE_API_KEY = "AIzaSyCL1slhaZAlAypXizqk-ZWL7Y86Ca8euko".trim();
const GOOGLE_TRANSLATE_API_URL = "https://translation.googleapis.com/language/translate/v2";

type GoogleTranslateResponse = {
  data?: {
    translations?: Array<{
      translatedText?: string;
      detectedSourceLanguage?: string;
    }>;
  };
  error?: {
    message?: string;
  };
};

export type GoogleTranslatedText = {
  text: string;
  detectedSourceLanguage?: string;
};

const wordTranslationCache = new Map<string, Promise<GoogleTranslatedText>>();
const cueTranslationCache = new Map<string, Promise<GoogleTranslatedText>>();

export function isGoogleTranslateConfigured(): boolean {
  return RAW_GOOGLE_TRANSLATE_API_KEY.length > 0;
}

function decodeHtmlEntities(text: string): string {
  if (!/[&<>]/.test(text)) {
    return text;
  }

  if (typeof document === "undefined") {
    return text
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'");
  }

  const textarea = document.createElement("textarea");
  textarea.innerHTML = text;
  return textarea.value;
}

function createCacheKey(text: string, source: string | undefined, target: string): string {
  return JSON.stringify([source ?? "", target, text]);
}

function rememberTranslation(
  cache: Map<string, Promise<GoogleTranslatedText>>,
  key: string,
  load: () => Promise<GoogleTranslatedText>,
): Promise<GoogleTranslatedText> {
  const existing = cache.get(key);
  if (existing) {
    return existing;
  }

  const pending = load().catch((error) => {
    cache.delete(key);
    throw error;
  });
  cache.set(key, pending);
  return pending;
}

async function readErrorMessage(response: Response): Promise<string> {
  const text = await response.text();
  if (!text.trim()) {
    return `Request failed with status ${response.status}.`;
  }

  try {
    const payload = JSON.parse(text) as GoogleTranslateResponse;
    const message = payload.error?.message;
    if (message) {
      return message;
    }
  } catch {
    // Fall through to plain-text handling.
  }

  return text.length > 400 ? `Request failed with status ${response.status}.` : text;
}

async function translateText(params: {
  text: string;
  source?: string;
  target: string;
}): Promise<GoogleTranslatedText> {
  if (!isGoogleTranslateConfigured()) {
    throw new Error(
      "Google Translate is not configured. Set VITE_GOOGLE_TRANSLATE_API_KEY in .env.local and restart the dev server.",
    );
  }

  let response: Response;
  try {
    response = await fetch(`${GOOGLE_TRANSLATE_API_URL}?key=${encodeURIComponent(RAW_GOOGLE_TRANSLATE_API_KEY)}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        q: params.text,
        source: params.source,
        target: params.target,
        format: "text",
      }),
    });
  } catch (error) {
    if (error instanceof TypeError) {
      throw new Error(
        "Unable to reach Google Translate. Check VITE_GOOGLE_TRANSLATE_API_KEY, that Cloud Translation is enabled, and restart the dev server after editing .env.local.",
      );
    }
    throw error;
  }

  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }

  const payload = (await response.json()) as GoogleTranslateResponse;
  const translation = payload.data?.translations?.[0];
  if (!translation?.translatedText) {
    throw new Error("Google Translate returned no translated text.");
  }

  return {
    text: decodeHtmlEntities(translation.translatedText),
    detectedSourceLanguage: translation.detectedSourceLanguage,
  };
}

export function translateEnglishWordToHebrew(word: string): Promise<GoogleTranslatedText> {
  const trimmed = word.trim();
  if (!trimmed) {
    throw new Error("No word to translate.");
  }

  return rememberTranslation(
    wordTranslationCache,
    createCacheKey(trimmed.toLowerCase(), "en", "he"),
    () =>
      translateText({
        text: trimmed,
        source: "en",
        target: "he",
      }),
  );
}

export function translateEnglishCueToHebrew(cueText: string): Promise<GoogleTranslatedText> {
  const trimmed = cueText.replace(/\s+/g, " ").trim();
  if (!trimmed) {
    throw new Error("No cue to translate.");
  }

  return rememberTranslation(
    cueTranslationCache,
    createCacheKey(trimmed, "en", "he"),
    () =>
      translateText({
        text: trimmed,
        source: "en",
        target: "he",
      }),
  );
}
