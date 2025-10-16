
# high-level goals

* play **local** video files with **local** SRT subtitles.
* clickable words in subtitles → add to a **local “unknown words” table** (with user-provided translation).
* persistent highlights across *all* movies:

  * **green** = exact word is unknown.
  * **orange** = indirect/variant match (e.g., *played* vs *play*).
* basic **subtitle style controls** (font/size/weight/color/shadow/background).
* runs **fully offline**, ideally as a **PWA**.

---

# tech stack (recommended)

* **Frontend framework:** React + TypeScript (clean types, testability).
* **Styling/UI:** Tailwind CSS + shadcn/ui (fast, consistent UI).
* **State mgmt:** Zustand (simple, testable) or Redux Toolkit (if you prefer strictness).
* **Local storage:** IndexedDB via **Dexie.js** (schema versioning, queries).
* **Subtitle parsing:** lightweight SRT parser (e.g., `subsrt` or `subtitle`); or a tiny custom parser.
* **Tokenization & stemming:** small JS porter stemmer (e.g., `wink-porter2-stemmer` or `porter-stemmer`), not heavy `natural`.
* **Workers:** Web Worker for parsing/indexing to keep UI smooth.
* **Build:** Vite.
* **Tests:** Vitest + React Testing Library (unit), Playwright/Cypress (e2e).
* **Optional:** File System Access API (Chrome/Edge) to remember file handles with user permission.

---

# core domain model (TypeScript)

```ts
// normalized = casefolded & unicode-normalized text used for matching.
type WordId = string;

interface UnknownWord {
  id: WordId;                   // uuid
  original: string;             // as clicked the first time: "Play"
  normalized: string;           // "play"
  stem: string;                 // porter("play") -> "play"
  translation?: string;         // user enters manually
  notes?: string;
  createdAt: number;
  updatedAt: number;
  status: "learning" | "known"; // extensible
}

interface SubtitleFile {
  id: string;                   // content hash or uuid
  name: string;                 // filename for UX
  bytesHash: string;            // sha-1/sha-256 for dedup
  totalCues: number;
  language?: string;
  addedAt: number;
}

interface Cue {
  index: number;
  startMs: number;
  endMs: number;
  rawText: string;              // original cue text
  tokens?: Token[];             // computed once then cached
}

interface Token {
  text: string;                 // literal surface token (e.g., "playing")
  normalized: string;           // "playing" -> "playing"
  stem: string;                 // porter("playing") -> "play"
  isWord: boolean;              // words vs punctuation
}

interface UserPrefs {
  subtitleStyle: {
    fontFamily: string;
    fontSizePx: number;
    fontWeight: number;         // 400..700
    color: string;
    outline: boolean;
    shadow: boolean;
    bgColor: string;
    lineHeight: number;         // e.g., 1.25
  };
  highlightColors: {
    exact: string;              // green
    variant: string;            // orange
  };
  lastOpened?: { videoName?: string; srtName?: string; };
}
```

---

# storage layout (Dexie)

* **tables**

  * `unknownWords` (primary key `id`, indexes on `normalized`, `stem`).
  * `subtitleFiles` (id, metadata).
  * `cues` (compound key `[fileId+index]` or separate table if you want lazy loading).
  * `prefs` (single row).
* **export/import**

  * JSON (and optional CSV for the word list).
* **migrations**

  * keep schema versions: easy to add fields later.

---

# app architecture (folders)

```
src/
  app/
    App.tsx
    routes/
      PlayerPage.tsx         // video + subtitle overlay + toolbar
      WordsPage.tsx          // table to edit translation etc.
      SettingsPage.tsx       // subtitle styles
  core/
    parsing/srtParser.ts     // SRT → cues
    nlp/tokenize.ts          // robust unicode tokenization
    nlp/stem.ts              // porter2 stemmer wrapper
    match/highlight.ts       // exact vs variant decision
    time/format.ts
  data/
    db.ts                    // Dexie schema + repos
    wordsRepo.ts
    filesRepo.ts
    cuesRepo.ts
    prefsRepo.ts
  features/
    player/
      VideoPlayer.tsx        // <video> with file input → blob URL
      SubtitleOverlay.tsx    // custom renderer with clickable tokens
      ControlsBar.tsx
    words/
      UnknownWordsTable.tsx  // editable table (translation, notes)
      AddWordDialog.tsx
    settings/
      SubtitleStylePanel.tsx
  workers/
    srtWorker.ts             // heavy parsing/tokenizing in a Worker
  utils/
    file.ts                  // hashing, blob handling
    guard.ts                 // type guards
    id.ts                    // uuid
```

---

# rendering subtitles & clicks

## why not `<track>` + VTT?

* browsers support **WebVTT**, not SRT. you’d need conversion and you **can’t** inject per-word clickable spans into native track rendering.

## custom overlay (recommended)

* parse SRT → cues.
* run **tokenization + stemming** on each cue (once).
* render the **current cue text** in an absolutely positioned overlay synced to `video.currentTime` (via `timeupdate` event—no need for `requestAnimationFrame`).
* split into tokens; wrap **word tokens** as:

  ```html
  <span
    class="token ..."
    data-word="playing"
    data-normalized="playing"
    data-stem="play"
    role="button"
    tabindex="0"
  >playing</span>
  ```
* click handler opens dialog:

  * prefill *original* with the clicked text.
  * compute `normalized` (casefold, NFC) and `stem`.
  * if it already exists in `unknownWords` → focus translation field.
  * save to Dexie (or update).
  * causes **overlay to rerender** with highlight logic pulled from the store.

## highlight logic

```ts
function getHighlightClass(token: Token, unknownIndexByNorm: Set<string>, unknownIndexByStem: Set<string>) {
  if (!token.isWord) return "";
  if (unknownIndexByNorm.has(token.normalized)) return "hl-exact";   // green
  if (unknownIndexByStem.has(token.stem))      return "hl-variant"; // orange
  return "";
}
```

* build `unknownIndexByNorm/stem` **once** per render from Dexie live query (or Zustand selector).

---

# tokenization (unicode-friendly)

* keep apostrophes within words (“don’t”), keep hyphenated forms as tokens.
* suggested regex (JS with unicode properties):

  ```ts
  const TOKENS = /(\p{L}+(?:['’-]\p{L}+)*)|(\d+)|([^\s\p{L}\d]+)/gu;
  ```
* for each match:

  * group1: word → `isWord=true`
  * group2: number → optional handling
  * group3: punctuation → `isWord=false`
* **normalized** = `str.toLowerCase().normalize('NFC')`
* **stem** = porter2(normalized) (using a tiny lib)

---

# workflow / user journey

1. **Select video** (file input → Blob URL set on `<video>`).
2. **Select SRT** (file input → read as text).
3. Send SRT text to **Worker**:

   * parse cues
   * tokenize + stem (cache tokens)
   * return cues (or store in IndexedDB; for a single session you can keep in memory)
4. **Overlay** subscribes to video time:

   * find active cue by current time (binary search in cues).
   * render tokens with highlight classes.
5. **Click word** → add/Edit dialog:

   * user saves translation.
   * re-render overlay: green/orange appears immediately.
6. **Words table (local)**:

   * sort/filter, inline edit translation, mark “known,” delete, export CSV/JSON.
7. **Settings**:

   * style controls live-preview; save to prefs.

---

# persistence & privacy

* everything stays **local** in IndexedDB.
* optionally prompt to **export** the dictionary JSON for backup.
* if you use File System Access API:

  * ask for persistent permission to the selected SRT folder to re-open quickly (feature-detect, fall back gracefully).

---

# “indirect result” (variant) definition

* **exact**: token.normalized equals an entry’s `normalized` (strict surface form).
* **variant**: token.stem equals entry’s `stem` but normalized doesn’t match.

  * ex: unknown = “play” → stem “play”
  * “played”, “playing”, “plays” → stem “play” → variant (orange).
* future: allow **custom patterns** per word (regex field) to widen or narrow “variant” logic.

---

# subtitle styling

* overlay container with CSS vars:

  ```css
  .subs {
    font-family: var(--sub-font, system-ui);
    font-size: var(--sub-size, 28px);
    font-weight: var(--sub-weight, 600);
    color: var(--sub-color, #fff);
    text-shadow: var(--sub-shadow, 0 0 2px #000, 0 0 4px #000);
    background: var(--sub-bg, rgba(0,0,0,0.25));
    line-height: var(--sub-line, 1.25);
    padding: .2em .4em;
    border-radius: 8px;
  }
  .hl-exact   { background: rgba(0, 180, 0, .25); }
  .hl-variant { background: rgba(255, 140, 0, .25); }
  ```
* UI writes to CSS variables (root or component scope) and saves to `prefs`.

---

# testing strategy

## unit (Vitest)

* **srtParser**: timestamps, cue splits, edge cases.
* **tokenize**: contractions, hyphens, unicode, punctuation.
* **stem**: mapping examples (play, played, playing → play).
* **highlight**: exact vs variant classification.
* **repos**: Dexie CRUD with in-memory adapter.

## component (React Testing Library)

* **SubtitleOverlay**: renders expected clickable spans, applies classes as dictionary changes.
* **AddWordDialog**: create/update flows.

## e2e (Playwright/Cypress)

* select video + srt, play to cue, click token, add translation, see green highlight.

---

# performance notes

* SRTs are small; still:

  * do parsing & tokenization in a **Web Worker**.
  * pre-compute stems/tokens once per load.
  * **binary search** for active cue by `currentTime`.
* no need to pre-index entire libraries; *highlights across all movies* will work because you:

  * always consult the `unknownWords` sets when rendering any cue in any file.
  * optional later: background index of all imported SRTs if you want analytics (“X occurrences across your library”).

---

# accessibility

* word spans are `role="button"`, keyboard focusable (`tabindex="0"`), `Enter`/`Space` triggers the dialog.
* ensure highlight colors meet contrast (option in settings: “high contrast”).
* allow pausing video when the dialog opens (manage focus, return focus on close).

---

# roadmap (MVP → next)

**MVP**

* local video + SRT load.
* overlay with clickable tokens.
* Dexie unknown words & table.
* stem-based highlighting.
* basic subtitle style controls.
* export/import JSON.

**Next**

* PWA installable + offline cache.
* remember last files (File System Access API).
* regex patterns per word.
* batch add/edit from table.
* hotkey to quickly add as unknown while paused.
* per-language stemming (if later you support non-English subs).

---

# recommended libs (lean choices)

* `dexie` (IndexedDB)
* `subsrt` (SRT parse) or tiny custom parser
* `wink-porter2-stemmer` (small, fast)
* `zustand` (state) or `@reduxjs/toolkit`
* `zod` (runtime validation of imported JSON)
* `vitest`, `@testing-library/react`, `playwright`

---

# small code slices (illustrative)

## highlight decision

```ts
const exactSet   = new Set(unknownWords.map(w => w.normalized));
const variantSet = new Set(unknownWords.map(w => w.stem));

function classesFor(token: Token) {
  if (!token.isWord) return "";
  if (exactSet.has(token.normalized)) return "hl-exact";
  if (variantSet.has(token.stem))     return "hl-variant";
  return "";
}
```

## tokenization

```ts
export function tokenize(text: string): Token[] {
  const out: Token[] = [];
  const re = /(\p{L}+(?:['’-]\p{L}+)*)|(\d+)|([^\s\p{L}\d]+)/gu;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const [raw, word, num, punct] = m;
    if (word) {
      const normalized = word.toLowerCase().normalize('NFC');
      out.push({ text: raw, normalized, stem: porter(normalized), isWord: true });
    } else if (num) {
      out.push({ text: raw, normalized: num, stem: num, isWord: false });
    } else {
      out.push({ text: raw, normalized: punct, stem: punct, isWord: false });
    }
  }
  return out;
}
```


