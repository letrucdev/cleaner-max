import { useState } from "react";
import { useTranslation } from "react-i18next";
import { PageHeader } from "@/components/app/PageHeader";
import { Segmented } from "@/components/app/Segmented";
import { TargetList, type PlatformFilter } from "@/features/targets/TargetList";

export function CachesPage() {
  const { t } = useTranslation();
  const [filter, setFilter] = useState<PlatformFilter>("all");
  return (
    <>
      <PageHeader
        title={t("caches.title")}
        subtitle={t("caches.subtitle")}
        actions={
          <Segmented
            label={t("caches.filter")}
            value={filter}
            onChange={setFilter}
            options={[
              { value: "all", label: t("common.all") },
              { value: "wsl", label: t("common.wsl") },
              { value: "windows", label: t("common.windows") },
            ]}
          />
        }
      />
      <div className="px-8 pt-5">
        <TargetList category="devCache" filter={filter} emptyText={t("caches.empty")} />
      </div>
    </>
  );
}
