// Mutable sim clock kept outside React: advanced once per frame, read by the
// renderer and the propagation worker scheduler without triggering re-renders.
export const simClock = {
  simTimeMs: Date.now(),
};
