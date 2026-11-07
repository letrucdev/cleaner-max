import { useQueryClient } from "@tanstack/react-query";
import { Container, HardDrive, Minimize2, Moon, RefreshCw, ShieldCheck, TriangleAlert, type LucideIcon } from "lucide-react";
import { motion } from "motion/react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { api, queryKeys, useOverview, type AdminTask, type Overview } from "@/lib/api";
import { formatBytes } from "@/lib/format";
import { itemVariants, listVariants } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { AdminTaskDialog, type AdminJob } from "./AdminTaskDialog";

type Tone = "green" | "orange" | "gray";
const pillTone: Record<Tone, string> = {
  green: "bg-success-soft text-success",
  orange: "bg-warning-soft text-warning",
  gray: "bg-fill text-muted-foreground",
};

interface Spec {
  id: string;
  icon: LucideIcon;
  title: string;
  desc: string;
  pill?: { text: string; tone: Tone };
  /** Present when the task can be run now. */
  run?: { label: string; task: AdminTask; warn: string };
  disabled?: boolean;
}

function useSpecs(o: Overview | undefined): Spec[] {
  const { t } = useTranslation();
  if (!o) return [];
  const specs: Spec[] = [];

  for (const d of o.virtualDisks) {
    if (d.kind === "dockerData") {
      specs.push({
        id: `compact:${d.path}`,
        icon: Minimize2,
        title: t("system.compactDocker"),
        desc: t("system.compactDockerDesc"),
        pill: { text: formatBytes(d.size), tone: "orange" },
        run: { label: t("system.compact"), task: { kind: "compactVhdx", path: d.path }, warn: t("system.compactDockerWarn") },
      });
    } else if (!d.sparse) {
      specs.push({
        id: `compact:${d.path}`,
        icon: Minimize2,
        title: t("system.compactWsl", { distro: d.owner }),
        desc: t("system.compactWslDesc"),
        pill: { text: formatBytes(d.size), tone: "orange" },
        run: { label: t("system.compact"), task: { kind: "compactVhdx", path: d.path }, warn: t("system.compactWarn") },
      });
    }
  }

  specs.push({
    id: "docker-prune",
    icon: Container,
    title: t("system.dockerPrune"),
    desc: t("system.dockerPruneDesc"),
    pill: o.dockerCli ? { text: t("system.dockerReady"), tone: "gray" } : { text: t("system.dockerMissing"), tone: "gray" },
    run: o.dockerCli ? { label: t("system.clean"), task: { kind: "dockerPrune" }, warn: t("system.dockerPruneWarn") } : undefined,
  });

  specs.push(
    o.hiberfil
      ? {
          id: "hibernate",
          icon: Moon,
          title: t("system.hibernate"),
          desc: t("system.hibernateDesc", { drive: o.systemDrive }),
          pill: { text: formatBytes(o.hiberfil), tone: "orange" },
          run: { label: t("system.turnOff"), task: { kind: "hibernateOff" }, warn: t("system.hibernateWarn") },
        }
      : { id: "hibernate", icon: Moon, title: t("system.hibernate"), desc: t("system.hibernateDesc", { drive: o.systemDrive }), pill: { text: t("system.hibernateOff"), tone: "green" } },
  );

  specs.push({
    id: "dism",
    icon: RefreshCw,
    title: t("system.dism"),
    desc: t("system.dismDesc"),
    run: { label: t("system.run"), task: { kind: "dismCleanup" }, warn: t("system.dismWarn") },
  });

  for (const d of o.virtualDisks.filter((v) => v.kind === "wslDistro")) {
    specs.push({
      id: `sparse:${d.owner}`,
      icon: HardDrive,
      title: t("system.sparse", { distro: d.owner }),
      desc: t("system.sparseDesc", { drive: o.systemDrive }),
      pill: d.sparse ? { text: t("system.sparseOn"), tone: "green" } : { text: t("system.sparseOff"), tone: "orange" },
      run: d.sparse ? undefined : { label: t("system.enable"), task: { kind: "setSparse", distro: d.owner }, warn: t("system.sparseWarn") },
    });
  }
  return specs;
}

export function AdminTasks() {
  const { t } = useTranslation();
  const overview = useOverview();
  const queryClient = useQueryClient();
  const specs = useSpecs(overview.data);
  const [confirm, setConfirm] = useState<Spec | null>(null);
  const [job, setJob] = useState<AdminJob | null>(null);
  const running = job !== null && job.outcome === undefined;

  async function run(spec: Spec) {
    if (!spec.run || running) return;
    setJob({ title: spec.title, startedAt: Date.now() });
    let outcome: NonNullable<AdminJob["outcome"]>;
    try {
      outcome = { result: await api.adminTask(spec.run.task) };
    } catch (e) {
      outcome = { error: String(e instanceof Error ? e.message : e) };
    }
    setJob((j) => j && { ...j, outcome });
    void queryClient.invalidateQueries({ queryKey: queryKeys.overview });
    void queryClient.invalidateQueries({ queryKey: queryKeys.history });
  }

  return (
    <section aria-labelledby="h-admin" className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between px-1">
        <h2 id="h-admin" className="text-[13px] font-semibold text-muted-foreground">
          {t("system.admin")}
        </h2>
        <span className="inline-flex items-center gap-1 text-[12px] text-muted-foreground">
          <ShieldCheck className="size-3.5" aria-hidden /> {t("system.uac")}
        </span>
      </div>
      {!overview.data ? (
        <Skeleton className="h-75 rounded-2xl" />
      ) : (
        <motion.ul variants={listVariants} initial="initial" animate="enter" className="flex flex-col gap-2.5">
          {specs.map((s) => {
            const Icon = s.icon;
            return (
              <motion.li variants={itemVariants} key={s.id} className="flex items-center gap-3.5 rounded-2xl border bg-card px-4 py-3.5 shadow-card">
                <div aria-hidden className="flex size-9.5 shrink-0 items-center justify-center rounded-[10px] bg-fill">
                  <Icon className="size-4.75 text-muted-foreground" strokeWidth={1.9} />
                </div>
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[13px] font-semibold">{s.title}</span>
                    {s.pill && <span className={cn("rounded-full px-2 py-0.5 text-[12px] font-semibold", pillTone[s.pill.tone])}>{s.pill.text}</span>}
                  </div>
                  <span className="text-[12px] text-muted-foreground">{s.desc}</span>
                </div>
                {s.run && (
                  <Button
                    variant="outline"
                    disabled={running}
                    onClick={() => setConfirm(s)}
                    className="h-8.5 shrink-0 rounded-[9px] bg-card px-3.5 text-[13px] text-accent-text"
                  >
                    <ShieldCheck />
                    {s.run.label}
                  </Button>
                )}
              </motion.li>
            );
          })}
        </motion.ul>
      )}

      <AlertDialog open={confirm !== null} onOpenChange={(o) => !o && setConfirm(null)}>
        <AlertDialogContent className="rounded-[18px] sm:max-w-115">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-[17px]">{confirm && t("system.confirmTitle", { task: confirm.title })}</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="flex flex-col gap-2 text-[13px]">
                <span>{confirm?.desc}</span>
                <span className="flex gap-2 text-warning">
                  <TriangleAlert className="mt-px size-4 shrink-0" aria-hidden />
                  {confirm?.run?.warn}
                </span>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="h-9 rounded-[9px] text-[13px]">{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="h-9 rounded-[9px] text-[13px] font-semibold"
              onClick={() => {
                const spec = confirm;
                setConfirm(null);
                if (spec) void run(spec);
              }}
            >
              <ShieldCheck /> {t("system.continue")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AdminTaskDialog job={job} onClose={() => setJob(null)} />
    </section>
  );
}
