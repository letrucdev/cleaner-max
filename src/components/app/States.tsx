import { CircleAlert, Inbox, RefreshCw } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const { t } = useTranslation();
  return (
    <div role="alert" className="flex flex-col items-center gap-3 rounded-2xl border bg-card p-8 text-center shadow-card">
      <CircleAlert className="size-8 text-destructive" aria-hidden />
      <div className="flex flex-col gap-1">
        <p className="text-[15px] font-semibold">{t("common.errorTitle")}</p>
        <p className="max-w-md text-[12px] wrap-break-word text-muted-foreground">{String(error instanceof Error ? error.message : error)}</p>
      </div>
      {onRetry && (
        <Button variant="outline" onClick={onRetry} className="h-9 rounded-[9px] px-4">
          <RefreshCw /> {t("common.retry")}
        </Button>
      )}
    </div>
  );
}

export function EmptyState({ text }: { text: string }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed p-10 text-center text-muted-foreground">
      <Inbox className="size-8" aria-hidden />
      <p className="text-[13px]">{text}</p>
    </div>
  );
}

/** Non-fatal scan problems (e.g. a WSL distro that didn't start). */
export function PartialErrors({ errors }: { errors: string[] }) {
  const { t } = useTranslation();
  if (errors.length === 0) return null;
  return (
    <div role="status" className="flex gap-2 rounded-xl bg-warning-soft px-4 py-3 text-[12px] text-warning">
      <CircleAlert className="mt-px size-4 shrink-0" aria-hidden />
      <div>
        <p className="font-semibold">{t("common.partialErrors")}</p>
        <ul className="mt-1 list-disc pl-4">
          {errors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/** Placeholder rows while a scan runs. */
export function ListSkeleton({ rows = 5 }: { rows?: number }) {
  const { t } = useTranslation();
  return (
    <div aria-busy="true" aria-label={t("common.scanning")} className="overflow-hidden rounded-2xl border bg-card shadow-card">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-3 border-t px-4 py-3.5 first:border-t-0">
          <Skeleton className="size-4.5 rounded-[5px]" />
          <div className="flex flex-1 flex-col gap-1.5">
            <Skeleton className="h-3.5 w-40" />
            <Skeleton className="h-3 w-72 max-w-full" />
          </div>
          <Skeleton className="h-3.5 w-14" />
        </div>
      ))}
    </div>
  );
}
