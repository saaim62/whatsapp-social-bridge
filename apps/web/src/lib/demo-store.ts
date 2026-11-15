import { create } from "zustand";

/**
 * Demo mode state. When a visitor is logged out, the app renders the
 * real shell and real pages, but the API layer serves sample data and
 * any real action opens the auth prompt instead of executing.
 */
type DemoState = {
  active: boolean;
  promptOpen: boolean;
  actionLabel: string;
  setActive: (v: boolean) => void;
  openPrompt: (actionLabel?: string) => void;
  closePrompt: () => void;
};

export const useDemoStore = create<DemoState>((set) => ({
  active: false,
  promptOpen: false,
  actionLabel: "do this",
  setActive: (active) => set({ active }),
  openPrompt: (actionLabel) =>
    set({ promptOpen: true, actionLabel: actionLabel || "do this" }),
  closePrompt: () => set({ promptOpen: false }),
}));
