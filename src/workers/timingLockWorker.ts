import { buildTimingLockedCues, type TimingLockOptions, type TimingLockResult } from "../core/subtitles/timingLock";

interface TimingLockRequest {
  id: string;
  options: TimingLockOptions;
}

interface TimingLockResponse {
  id: string;
  result?: TimingLockResult;
  error?: string;
}

const ctx = self as unknown as { postMessage: (message: TimingLockResponse) => void };

self.addEventListener("message", (event: MessageEvent<TimingLockRequest>) => {
  const { id, options } = event.data;
  try {
    const result = buildTimingLockedCues(options);
    ctx.postMessage({ id, result });
  } catch (error) {
    ctx.postMessage({
      id,
      error: error instanceof Error ? error.message : "Failed to compute timing lock alignment.",
    });
  }
});

export {};
