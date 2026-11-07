import { motion } from "motion/react";
import { useId } from "react";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { springSnappy } from "@/lib/motion";
import { cn } from "@/lib/utils";

interface Option<T extends string> {
  value: T;
  label: string;
}

/** macOS-style segmented control: Radix ToggleGroup with a thumb that slides between options. */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
  className,
}: {
  value: T;
  onChange: (value: T) => void;
  options: Option<T>[];
  label: string;
  className?: string;
}) {
  const thumbId = useId();
  return (
    <ToggleGroup
      type="single"
      value={value}
      onValueChange={(v) => v && onChange(v as T)}
      aria-label={label}
      className={cn("inline-flex gap-0.5 rounded-[9px] bg-fill p-0.5", className)}
    >
      {options.map((o) => (
        <ToggleGroupItem
          key={o.value}
          value={o.value}
          className="relative h-7.5 rounded-[7px] border-0 bg-transparent px-3.5 text-[13px] font-medium text-foreground shadow-none hover:bg-transparent data-[state=on]:bg-transparent data-[state=on]:font-semibold"
        >
          {value === o.value && (
            <motion.span
              layoutId={thumbId}
              transition={springSnappy}
              className="absolute inset-0 rounded-[7px] bg-card shadow-[0_1px_3px_rgb(0_0_0/0.12)] dark:bg-[#636366]"
            />
          )}
          <span className="relative">{o.label}</span>
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}
