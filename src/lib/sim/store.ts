import { create } from "zustand";

interface SimState {
  playing: boolean;
  speed: number;
  setPlaying: (playing: boolean) => void;
  setSpeed: (speed: number) => void;
}

export const useSimStore = create<SimState>((set) => ({
  playing: true,
  speed: 1,
  setPlaying: (playing) => set({ playing }),
  setSpeed: (speed) => set({ speed }),
}));
