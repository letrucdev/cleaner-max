import { create } from "zustand";
import type { CleanItem } from "@/lib/api";

export type PageId = "overview" | "caches" | "projects" | "system" | "history" | "settings";

/** One entry of the confirmation list (what the user is about to delete). */
export interface CleanSelectionEntry {
  item: CleanItem;
  /** Display label and where it lives. */
  label: string;
  where: string;
  /** Estimated bytes, `null` when unknown until run. */
  size: number | null;
}

interface UiState {
  page: PageId;
  setPage: (page: PageId) => void;
  /** Items waiting for confirmation in the clean dialog (`null` = dialog closed). */
  pendingClean: CleanSelectionEntry[] | null;
  /** Items that will be skipped and why (shown in the dialog). */
  pendingSkipped: { label: string; reason: string; size: number | null }[];
  openClean: (entries: CleanSelectionEntry[], skipped?: UiState["pendingSkipped"]) => void;
  closeClean: () => void;
}

export const useUi = create<UiState>()((set) => ({
  page: "overview",
  setPage: (page) => set({ page }),
  pendingClean: null,
  pendingSkipped: [],
  openClean: (entries, skipped = []) => set({ pendingClean: entries, pendingSkipped: skipped }),
  closeClean: () => set({ pendingClean: null, pendingSkipped: [] }),
}));
