# Timing Lock Regression Cases

This repo often uses the root `heb.srt` and `eng.srt` files as scratch inputs for subtitle timing-lock investigations. Those files are replaced over time, so every important alignment bug should be reduced into a durable regression case.

When investigating a request like "check what it does around line X":

- Read a local window around the requested SRT line or cue, usually 10 to 20 cues on each side.
- Compare the actual English and Hebrew meanings manually. Do not rely only on timestamp proximity.
- Identify the intended cue pairing by sentence meaning, speaker flow, and surrounding context.
- Run the timing-lock logic and inspect the shifted cue times.
- If the behavior is wrong and the fix matters, add a focused test to `src/core/subtitles/timingLock.test.ts`.
- Keep only enough copied cue data to reproduce the behavior. Whole SRT files should remain scratch inputs, not fixtures.
- Prefer cue indexes, timestamps, and text snippets in tests and notes. SRT line numbers are unstable after the scratch files are replaced.

Good regression assertions describe the semantic alignment rule that must survive later changes: a translated cue should start at its matching English boundary, a merged translated cue should not stretch across unrelated dialogue, a local shift should stay continuous until a real matching section appears, or a later section should deliberately realign after a major drift.
