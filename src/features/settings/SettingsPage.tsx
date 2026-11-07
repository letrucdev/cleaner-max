import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { Folder, Minus, Plus } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { PageHeader } from "@/components/app/PageHeader";
import { Segmented } from "@/components/app/Segmented";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { itemVariants, spring } from "@/lib/motion";
import { useProjectRoots } from "@/lib/selectors";
import { useSettings, type ThemePref } from "@/stores/settings";

/** iOS/macOS switches are green when on (design token: success fill). */
const switchGreen = "data-[state=checked]:bg-[#34c759] dark:data-[state=checked]:bg-[#30d158]";

function Group({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <motion.section variants={itemVariants} aria-labelledby={id} className="flex flex-col gap-2">
      <h2 id={id} className="px-1 text-[13px] font-semibold text-muted-foreground">
        {title}
      </h2>
      <div className="divide-y rounded-2xl border bg-card shadow-card">{children}</div>
    </motion.section>
  );
}

function Row({ label, hint, labelId, children }: { label: string; hint?: string; labelId?: string; children: ReactNode }) {
  return (
    <div className="flex min-h-13 flex-wrap items-center justify-between gap-3 px-4 py-2">
      <div className="flex flex-col gap-0.5">
        <span id={labelId} className="text-[13px]">
          {label}
        </span>
        {hint && <span className="text-[12px] text-muted-foreground">{hint}</span>}
      </div>
      {children}
    </div>
  );
}

function DaysSelect({ value, onChange, options, labelId }: { value: number; onChange: (v: number) => void; options: number[]; labelId: string }) {
  const { t } = useTranslation();
  return (
    <Select value={String(value)} onValueChange={(v) => onChange(Number(v))}>
      <SelectTrigger aria-labelledby={labelId} className="h-7.5 min-w-27.5 rounded-[7px] bg-card text-[13px]">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((d) => (
          <SelectItem key={d} value={String(d)} className="text-[13px]">
            {t("settings.days", { count: d })}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function SettingsPage() {
  const { t, i18n } = useTranslation();
  const s = useSettings();
  const roots = useProjectRoots();
  const lang = i18n.resolvedLanguage === "en" ? "en" : "vi";

  async function addRoot() {
    const picked = await openDialog({ directory: true, multiple: false });
    if (typeof picked === "string" && !roots.includes(picked)) s.setProjectRoots([...roots, picked]);
  }

  return (
    <>
      <PageHeader title={t("nav.settings")} />
      <div className="flex max-w-190 flex-col gap-6 px-8 pt-5 pb-8">
        <Group id="h-general" title={t("settings.general")}>
          <Row label={t("settings.language")}>
            <Segmented
              label={t("settings.language")}
              value={lang}
              onChange={(v) => void i18n.changeLanguage(v)}
              options={[
                { value: "vi", label: "Tiếng Việt" },
                { value: "en", label: "English" },
              ]}
            />
          </Row>
          <Row label={t("settings.theme")}>
            <Segmented<ThemePref>
              label={t("settings.theme")}
              value={s.theme}
              onChange={s.setTheme}
              options={[
                { value: "system", label: t("settings.themeSystem") },
                { value: "light", label: t("settings.themeLight") },
                { value: "dark", label: t("settings.themeDark") },
              ]}
            />
          </Row>
        </Group>

        <Group id="h-scan" title={t("settings.scan")}>
          <AnimatePresence initial={false}>
            {roots.map((r) => (
              <motion.div
                key={r}
                layout
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, transition: { duration: 0.1 } }}
                transition={spring}
              >
                <div className="flex min-h-12 items-center gap-3 px-4 py-1.5">
                  <Folder className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                  <span className="min-w-0 flex-1 truncate text-[13px]" title={r}>
                    {r}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={t("projects.removeRoot", { path: r })}
                    onClick={() => s.setProjectRoots(roots.filter((x) => x !== r))}
                    className="text-muted-foreground"
                  >
                    <Minus />
                  </Button>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
          <div className="px-3 py-2">
            <Button variant="ghost" onClick={() => void addRoot()} className="h-8 px-2 text-[13px] font-medium text-accent-text">
              <Plus /> {t("projects.addRoot")}
            </Button>
          </div>
          <Row label={t("settings.staleDays")} labelId="l-stale">
            <DaysSelect labelId="l-stale" value={s.staleDays} onChange={s.setStaleDays} options={[30, 90, 180]} />
          </Row>
          <Row label={t("settings.activeDays")} hint={t("settings.activeHint")} labelId="l-active">
            <DaysSelect labelId="l-active" value={s.activeDays} onChange={s.setActiveDays} options={[7, 14, 30]} />
          </Row>
        </Group>

        <Group id="h-safety" title={t("settings.safety")}>
          <Row label={t("settings.preview")} labelId="l-preview">
            <Switch checked disabled aria-labelledby="l-preview" aria-describedby="always-on" className={switchGreen} />
          </Row>
          <Row label={t("settings.skipOpen")} hint={t("settings.skipOpenHint")} labelId="l-skip">
            <Switch checked disabled aria-labelledby="l-skip" aria-describedby="always-on" className={switchGreen} />
          </Row>
          <Row label={t("settings.record")} hint={t("settings.recordHint")} labelId="l-record">
            <Switch checked={s.recordHistory} onCheckedChange={s.setRecordHistory} aria-labelledby="l-record" className={switchGreen} />
          </Row>
          <span id="always-on" className="sr-only">
            {t("settings.alwaysOn")}
          </span>
        </Group>
      </div>
    </>
  );
}
