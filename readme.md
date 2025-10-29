# Subtitle Word Tracker

Local-first tool for studying vocabulary while watching movies with subtitle files. The app parses SRT cues, tokenizes words, and highlights anything you've marked as unknown so you can focus on learning while you watch.

## Current status

The following slices are already implemented:

- Vite + React + Tailwind scaffold with top-level routing between Player, Words, Quotes, and Settings views.
- Custom SRT parser and Unicode-aware tokenizer with a lightweight stemmer wrapper.
- In-memory dictionary store that classifies tokens as exact or stem-based variants for highlighting.
- Subtitle style controls with live preview and CSS variable syncing.

## Next steps

Focus development on the unfinished pieces below.

### MVP checklist

- [x] Allow loading a local video file and render subtitles in a custom overlay positioned on top of playback.
- [x] Move dictionary, subtitle files, and preferences into Dexie-backed storage (schema + repositories).
- [x] Build a word management table that supports editing translation/notes, updating status, and deleting entries.
- [x] Support export/import of the unknown words list as JSON (and optional CSV).
- [x] Wire up a worker to parse + tokenize SRT files without blocking the UI and keep cached tokens per cue.
- [x] Persist and restore the most recently opened video/subtitle combination.

### Nice-to-haves

- [ ] Make the app installable as a PWA with offline caching.
- [ ] Use the File System Access API to remember granted handles for faster re-opening (with graceful fallbacks).
- [ ] Allow custom regex patterns per word to widen or narrow variant matching.
- [ ] Add hotkeys for quickly marking a word as unknown while paused.
- [ ] Explore per-language stemming strategies for non-English subtitles.

## Architecture guide

```
src/
  app/
    App.tsx
    routes/
      PlayerPage.tsx         // video + overlay once implemented
      WordsPage.tsx          // dictionary table & editing UI
      QuotesPage.tsx         // cross-file quote browser for unknown words
      SettingsPage.tsx       // subtitle style controls (done)
  core/
    parsing/srtParser.ts     // SRT → cues (done)
    nlp/tokenize.ts          // unicode tokenization (done)
    nlp/stem.ts              // porter stemmer wrapper (done)
  data/
    db.ts                    // Dexie schema + initialization
    wordsRepo.ts             // CRUD helpers for unknown words
    filesRepo.ts             // subtitle file metadata cache
    cuesRepo.ts              // per-file cue storage
    prefsRepo.ts             // persisted subtitle preferences
  workers/
    srtWorker.ts             // offload parsing/tokenizing
  utils/
    file.ts                  // hashing, blob helpers
    guard.ts                 // runtime type guards
    id.ts                    // uuid helpers
```

## Testing game plan

- Unit tests (Vitest) for the SRT parser, tokenizer, stemmer, highlight classification, and Dexie repositories.
- Component tests (React Testing Library) around the subtitle overlay and word management workflows.
- End-to-end smoke (Playwright/Cypress): load local media, click to add/update a word, verify highlight state.

## How to run

1. Install dependencies:
   ```bash
   npm install
   ```
2. Start the development server:
   ```bash
   npm run dev
   ```
3. Run the production build (optional):
   ```bash
   npm run build
   ```

All commands run entirely offline using the local Node environment.
