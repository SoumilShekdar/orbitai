import { create } from "zustand";

interface UiState {
  selectedIndex: number | null;
  hoveredIndex: number | null;
  hoverScreen: { x: number; y: number } | null;
  setSelected: (index: number | null) => void;
  setHovered: (index: number | null, screen?: { x: number; y: number } | null) => void;
}

export const useUiStore = create<UiState>((set) => ({
  selectedIndex: null,
  hoveredIndex: null,
  hoverScreen: null,
  setSelected: (selectedIndex) => set({ selectedIndex }),
  setHovered: (hoveredIndex, hoverScreen = null) => set({ hoveredIndex, hoverScreen }),
}));
