import { useTranslation } from "react-i18next";
import { PageHeader } from "@/components/app/PageHeader";
import { TargetList } from "@/features/targets/TargetList";
import { AdminTasks } from "./AdminTasks";

/** Windows junk (left) and administrator tasks (right), as in the approved design. */
export function SystemPage() {
  const { t } = useTranslation();
  return (
    <>
      <PageHeader title={t("nav.system")} subtitle={t("system.subtitle")} />
      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(440px,100%),1fr))] items-start gap-6 px-8 pt-5 pb-8">
        <section aria-label={t("system.junk")} className="flex flex-col gap-2">
          <h2 className="px-1 text-[13px] font-semibold text-muted-foreground">{t("system.junk")}</h2>
          <TargetList category="windowsJunk" emptyText={t("system.empty")} hideSingleGroupTitle />
        </section>
        <AdminTasks />
      </div>
    </>
  );
}
