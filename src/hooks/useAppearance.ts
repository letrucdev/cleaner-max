import { useEffect, useRef, useSyncExternalStore } from "react";
import { useAppInfo } from "@/lib/api";
import { commands } from "@/lib/bindings";
import { useSettings } from "@/stores/settings";

const darkQuery = typeof window !== "undefined" ? window.matchMedia("(prefers-color-scheme: dark)") : null;
const reducedMotion = typeof window !== "undefined" ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;
// Captured before the browser mock installs itself, so this is true only in the real app.
const inTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

// Where the user last pressed: the theme change radiates from there.
let lastPointer: { x: number; y: number } | null = null;
if (typeof window !== "undefined") {
  window.addEventListener("pointerdown", (e) => (lastPointer = { x: e.clientX, y: e.clientY }), { capture: true, passive: true });
}

function subscribe(cb: () => void) {
  darkQuery?.addEventListener("change", cb);
  return () => darkQuery?.removeEventListener("change", cb);
}

/** "light" | "dark" after resolving the "system" preference. */
export function useResolvedTheme(): "light" | "dark" {
  const pref = useSettings((s) => s.theme);
  const systemDark = useSyncExternalStore(subscribe, () => darkQuery?.matches ?? false);
  return pref === "system" ? (systemDark ? "dark" : "light") : pref;
}

/**
 * Switch the `dark` class with a View Transition: the new theme grows as a circle from the
 * last pointer position (a plain cross-fade with reduced motion). WebView2 is Chromium, so the
 * API is available in the app; other browsers just switch instantly.
 */
function applyTheme(dark: boolean) {
  const root = document.documentElement;
  if (root.classList.contains("dark") === dark) return;
  const toggle = () => root.classList.toggle("dark", dark);

  if (!document.startViewTransition) {
    toggle();
    return;
  }
  const reduce = reducedMotion?.matches ?? false;
  root.dataset.themeTransition = reduce ? "fade" : "reveal";
  const transition = document.startViewTransition(toggle);
  transition.finished.finally(() => delete root.dataset.themeTransition);
  if (reduce) return;

  const { innerWidth: w, innerHeight: h } = window;
  const { x, y } = lastPointer ?? { x: w / 2, y: h / 2 };
  const radius = Math.hypot(Math.max(x, w - x), Math.max(y, h - y));
  void transition.ready.then(() => {
    root.animate(
      { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`] },
      { duration: 520, easing: "cubic-bezier(0.23, 1, 0.32, 1)", pseudoElement: "::view-transition-new(root)" },
    );
  });
}

/** Keep `<html>` classes and the native window in sync with the theme and Mica state. */
export function useAppearance() {
  const theme = useResolvedTheme();
  const pref = useSettings((s) => s.theme);
  const vibrancy = useAppInfo().data?.vibrancy ?? false;
  const first = useRef(true);

  useEffect(() => {
    const dark = theme === "dark";
    if (first.current) {
      // No animation on startup.
      first.current = false;
      document.documentElement.classList.toggle("dark", dark);
    } else {
      applyTheme(dark);
    }
    if (inTauri) void commands.setWindowTheme(dark, pref === "system");
  }, [theme, pref]);

  useEffect(() => {
    document.documentElement.classList.toggle("vibrant", vibrancy);
  }, [vibrancy]);

  return theme;
}
