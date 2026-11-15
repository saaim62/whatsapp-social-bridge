import { create } from 'zustand';

/**
 * Tiny shared store between the DOM shell and the WebGL scene.
 * The canvas reads these values inside useFrame (via getState) so
 * camera choreography never triggers React re-renders.
 */
type SceneState = {
  route: string;
  /** 0..1 — how far the main content pane is scrolled. */
  scroll: number;
  setRoute: (route: string) => void;
  setScroll: (scroll: number) => void;
};

export const useSceneStore = create<SceneState>((set) => ({
  route: '/',
  scroll: 0,
  setRoute: (route) => set({ route }),
  setScroll: (scroll) => set({ scroll }),
}));
