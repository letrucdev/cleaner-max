import { create } from "zustand";
import { persist } from "zustand/middleware";

export type ThemePref = "system" | "light" | "dark";

interface SettingsState {
  theme: ThemePref;
  /** `null` until the user edits the list: the backend's suggested roots are used. */
  projectRoots: string[] | null;
  /** A project counts as old (pre-selected) after this many days without changes. */
  staleDays: number;
  /** Projects changed within this many days are never cleaned. */
  activeDays: number;
  /** Append real clean-ups and admin tasks to the local history. */
  recordHistory: boolean;
  setTheme: (theme: ThemePref) => void;
  setProjectRoots: (roots: string[]) => void;
  setStaleDays: (days: number) => void;
  setActiveDays: (days: number) => void;
  setRecordHistory: (on: boolean) => void;
}

/** Per-device preferences, persisted in the webview's localStorage. */
export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      theme: "system",
      projectRoots: null,
      staleDays: 90,
      activeDays: 14,
      recordHistory: true,
      setTheme: (theme) => set({ theme }),
      setProjectRoots: (projectRoots) => set({ projectRoots }),
      setStaleDays: (staleDays) => set({ staleDays }),
      setActiveDays: (activeDays) => set({ activeDays }),
      setRecordHistory: (recordHistory) => set({ recordHistory }),
    }),
    { name: "dc-settings", version: 1 },
  ),
);
