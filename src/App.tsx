import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef } from "react";
import { CleanDialog } from "@/components/app/CleanDialog";
import { PAGE_OVERLAY_ID } from "@/components/app/SelectionBar";
import { Sidebar } from "@/components/app/Sidebar";
import { Toaster } from "@/components/ui/sonner";
import { CachesPage } from "@/features/caches/CachesPage";
import { OverviewPage } from "@/features/overview/OverviewPage";
import { HistoryPage } from "@/features/history/HistoryPage";
import { ProjectsPage } from "@/features/projects/ProjectsPage";
import { SettingsPage } from "@/features/settings/SettingsPage";
import { SystemPage } from "@/features/system/SystemPage";
import { useAppearance } from "@/hooks/useAppearance";
import { pageVariants } from "@/lib/motion";
import { useUi, type PageId } from "@/stores/ui";

function Page({ id }: { id: PageId }) {
  switch (id) {
    case "overview":
      return <OverviewPage />;
    case "caches":
      return <CachesPage />;
    case "projects":
      return <ProjectsPage />;
    case "system":
      return <SystemPage />;
    case "settings":
      return <SettingsPage />;
    case "history":
      return <HistoryPage />;
  }
}

export default function App() {
  useAppearance();
  const page = useUi((s) => s.page);
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scroller.current?.scrollTo({ top: 0 });
  }, [page]);

  return (
    <div className="flex h-screen">
      <Sidebar />
      <main className="relative flex min-w-0 flex-1 flex-col bg-background">
        <div ref={scroller} className="h-full overflow-y-auto">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div key={page} variants={pageVariants} initial="initial" animate="enter" exit="exit">
              <Page id={page} />
            </motion.div>
          </AnimatePresence>
        </div>
        {/* Floating UI (selection bar) lives here, outside the transformed page. */}
        <div id={PAGE_OVERLAY_ID} className="pointer-events-none absolute inset-0 z-20" />
      </main>
      <CleanDialog />
      <Toaster position="top-center" />
    </div>
  );
}
