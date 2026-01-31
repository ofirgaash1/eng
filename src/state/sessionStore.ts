import { create } from "zustand";

type SessionState = {
  videoName: string;
  videoUrl: string | null;
  videoBlob: Blob | null;
  setVideoFromFile: (file: File) => void;
  setVideoFromBlob: (name: string, blob: Blob) => void;
  setVideoNameOnly: (name: string) => void;
  clearVideo: () => void;
};

export const useSessionStore = create<SessionState>((set, get) => ({
  videoName: "",
  videoUrl: null,
  videoBlob: null,
  setVideoFromFile: (file) => {
    const previousUrl = get().videoUrl;
    if (previousUrl) {
      URL.revokeObjectURL(previousUrl);
    }
    set({
      videoName: file.name,
      videoUrl: URL.createObjectURL(file),
      videoBlob: file,
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
    });
  },
  setVideoNameOnly: (name) => {
    const previousUrl = get().videoUrl;
    if (previousUrl) {
      URL.revokeObjectURL(previousUrl);
    }
    set({ videoName: name, videoUrl: null, videoBlob: null });
  },
  clearVideo: () => {
    const previousUrl = get().videoUrl;
    if (previousUrl) {
      URL.revokeObjectURL(previousUrl);
    }
    set({ videoName: "", videoUrl: null, videoBlob: null });
  },
}));
