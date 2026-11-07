import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MotionConfig } from "motion/react";
import React from "react";
import ReactDOM from "react-dom/client";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./i18n";
import "./index.css";
import App from "./App";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 5 * 60_000, retry: 1, refetchOnWindowFocus: false },
  },
});

// Release builds behave like a native app: no WebView context menu (Back, Reload, Inspect…).
// Text fields keep theirs so copy/paste still works.
if (import.meta.env.PROD) {
  window.addEventListener("contextmenu", (e) => {
    const el = e.target as HTMLElement | null;
    if (el?.closest("input, textarea, [contenteditable='true']")) return;
    e.preventDefault();
  });
}

async function boot() {
  // Outside Tauri (plain `npm run dev` in a browser) serve realistic fake data.
  if (import.meta.env.DEV && !("__TAURI_INTERNALS__" in window)) {
    const { installMockIpc, applyScreenshotParams } = await import("./mocks/ipc");
    installMockIpc();
    await applyScreenshotParams();
  }

  ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
    <React.StrictMode>
      <QueryClientProvider client={queryClient}>
        <MotionConfig reducedMotion="user">
          <TooltipProvider delayDuration={400}>
            <App />
          </TooltipProvider>
        </MotionConfig>
      </QueryClientProvider>
    </React.StrictMode>,
  );
}

void boot();
