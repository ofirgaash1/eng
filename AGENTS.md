# Repository Instructions

## Subtitle Timing Lock Investigations

The root `heb.srt` and `eng.srt` files are temporary investigation inputs. They may be replaced between sessions, so they must not be treated as durable regression fixtures.

When the user asks to check subtitle lock behavior around a specific line in `heb.srt` or `eng.srt`, inspect nearby cues in both languages, compare the English and Hebrew sentence meanings, run the timing-lock logic, and judge whether the computed alignment is semantically correct. Line numbers are only hints for finding the local cue window; durable notes and tests should use cue indexes, timestamps, and text excerpts.

When a bad alignment is found and fixed, preserve the case as a focused regression test in `src/core/subtitles/timingLock.test.ts`. Copy only the minimal relevant cue window into the test, with enough surrounding cues to reproduce the section behavior. Assertions should encode the intended semantic pairing, such as a Hebrew cue starting at the matching English cue boundary, a cue not stretching across unrelated dialogue, or a later section keeping or changing shift appropriately.

Use `notes/timing-lock-regressions.md` as the human-readable ledger for this workflow and for any tricky cases that need context beyond the test assertions.
