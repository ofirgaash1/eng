import { create } from "zustand";

type SessionState = {
  videoName: string;
  videoUrl: string | null;
  videoBlob: Blob | null;
  videoDurationMs: number | null;
  setVideoFromFile: (file: File) => void;
  setVideoFromBlob: (name: string, blob: Blob) => void;
  setVideoNameOnly: (name: string) => void;
  clearVideo: () => void;
  setVideoDurationMs: (durationMs: number | null) => void;
};

export const useSessionStore = create<SessionState>((set, get) => ({
  videoName: "",
  videoUrl: null,
  videoBlob: null,
  videoDurationMs: null,
  setVideoFromFile: (file) => {
    const previousUrl = get().videoUrl;
    if (previousUrl) {
      URL.revokeObjectURL(previousUrl);
    }
    set({
      videoName: file.name,
      videoUrl: URL.createObjectURL(file),
      videoBlob: file,
      videoDurationMs: null,
    });
  },
  setVideoFromBlob: (name, blob) => {
    const previousUrl = get().videoUrl;
    if (previousUrl) {
      URL.revokeObjectURL(previousUrl);
    }
    set({
      videoName: name,
      videoUrl: URL.createObjectURL(blob),
      videoBlob: blob,
      videoDurationMs: null,
    });
  },
  setVideoNameOnly: (name) => {
    const previousUrl = get().videoUrl;
    if (previousUrl) {
      URL.revokeObjectURL(previousUrl);
    }
    set({ videoName: name, videoUrl: null, videoBlob: null, videoDurationMs: null });
  },
  clearVideo: () => {
    const previousUrl = get().videoUrl;
    if (previousUrl) {
      URL.revokeObjectURL(previousUrl);
    }
    set({ videoName: "", videoUrl: null, videoBlob: null, videoDurationMs: null });
  },
  setVideoDurationMs: (durationMs) => {
    set({ videoDurationMs: durationMs });
  },
}));
