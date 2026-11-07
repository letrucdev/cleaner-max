import { motion } from "motion/react";
import type { ReactNode } from "react";
import { itemVariants } from "@/lib/motion";

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <motion.header variants={itemVariants} className="flex flex-wrap items-end justify-between gap-4 px-8 pt-7">
      <div className="flex min-w-0 flex-col gap-1">
        <h1 className="text-[28px] leading-tight font-bold tracking-[-0.02em]">{title}</h1>
        {subtitle && <p className="text-[13px] text-muted-foreground">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </motion.header>
  );
}
