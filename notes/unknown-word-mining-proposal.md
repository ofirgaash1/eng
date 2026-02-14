# Unknown-word mining from imported subtitles (proposal)

## Problem
Users want to learn from *already watched* movies/episodes without manually replaying everything.

## Recommendation (better UX than a separate "All Words" tab)
Create a **"Word Inbox" mode inside the existing Words page** instead of a brand-new top-level tab.

Why:
- Keeps all vocabulary actions in one place (less navigation).
- Avoids duplicate table logic and duplicate learning workflows.
- Makes it easy to compare "known unknowns" and "candidates" side-by-side.

## Proposed flow
1. User uploads subtitles in **Quotes** (already supported).
2. App builds a **Candidate Words index** from all imported subtitle cues.
3. In **Words**, user switches between:
   - **Saved unknowns** (current table)
   - **Inbox candidates** (new table)
4. User triages candidate rows with one-click actions:
   - **Add to Unknowns**
   - **Ignore**
   - **Mark Known**

## Candidate table design
Columns:
- Word (surface form)
- Stem
- Frequency rank (from existing list)
- Subtitle frequency (count across imported subtitles)
- Example quote snippet
- Source count (how many files contain it)
- Actions (Add / Ignore / Known)

Default sorting:
- Primary: **global frequency rank ascending** (rarer first, as requested)
- Secondary: **subtitle frequency descending** (frequent-in-your-content first)

This ordering surfaces words that are both uncommon in the language and common in user media.

## Filtering and quality controls
To reduce noise, include filters/toggles:
- Min token length (default: 3)
- Exclude numbers/symbols
- Exclude proper nouns (heuristic)
- Exclude top N common words (stopword threshold)
- Only show unseen (not already in unknowns, ignored, or marked known)
- Source filter (specific subtitle files / series)

## Data model additions
- `candidate_words`
  - `normalized` (PK)
  - `stem`
  - `subtitleCount`
  - `sourceCount`
  - `firstSeenAt`
  - `lastSeenAt`
- `candidate_word_sources`
  - `normalized`
  - `subtitleHash`
  - `count`
- `word_decisions`
  - `normalized`
  - `decision` (`unknown` | `known` | `ignored`)
  - `updatedAt`

Notes:
- `unknown` decision should insert/update current unknown words table.
- `known` and `ignored` should hide candidates by default (with optional "show resolved" toggle).

## Where to compute candidates
- Compute incrementally when subtitle cues are saved (best long-term).
- Also expose a one-time **"Rebuild Inbox"** button in case logic changes.

## Why this is nicer than "click one by one in huge list"
- Prioritized queue instead of raw full-vocabulary dump.
- Fast triage actions and persistence of decisions.
- Better signal using combined metrics (rank + personal subtitle frequency).

## Optional enhancements
- Batch actions (select many -> Add to Unknowns / Ignore).
- Keyboard triage (`A` add, `I` ignore, `K` known, arrows to navigate).
- "Learning score" = function of rarity, personal repetition, and recency.
- Show 1-3 context snippets before adding.

## MVP slice
1. Build candidate aggregation from imported cues.
2. Add Inbox mode in Words page.
3. Implement Add/Ignore/Known decisions.
4. Add default sort and basic filters.

This MVP solves the original pain without adding a heavy new top-level navigation area.
