import { format, formatDistanceToNowStrict } from "date-fns";
import { enUS, vi } from "date-fns/locale";
import { filesize } from "filesize";
import i18n from "@/i18n";

const dateLocales = { vi, en: enUS } as const;

function lang(): "vi" | "en" {
  return i18n.resolvedLanguage === "en" ? "en" : "vi";
}

/**
 * Bytes → "26,8 GB" / "26.8 GB". Binary units labelled GB/MB like Windows Explorer (JEDEC),
 * localized decimal separator.
 */
export function formatBytes(bytes: number, round = 1): string {
  const locale = lang() === "vi" ? "vi-VN" : "en-US";
  const b = Math.max(0, bytes);
  // Move to the next unit at 1000 (not 1024) so we never print "1.003,5 MB": "0,98 GB" reads better.
  let exponent = 0;
  while (exponent < 4 && b >= 1000 * 1024 ** exponent) exponent++;
  return filesize(b, { standard: "jedec", round, locale, exponent }) as string;
}

/** "khoảng 2 tháng trước" / "2 months ago". */
export function formatRelative(ms: number): string {
  return formatDistanceToNowStrict(new Date(ms), { addSuffix: true, locale: dateLocales[lang()] });
}

/** "06/11/2026" / "11/06/2026". */
export function formatDate(ms: number): string {
  return format(new Date(ms), "P", { locale: dateLocales[lang()] });
}

/** "06/11/2026 20:12". */
export function formatDateTime(ms: number): string {
  return format(new Date(ms), "Pp", { locale: dateLocales[lang()] });
}

/** Last path segment of a Windows or Linux path. */
export function baseName(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).pop() ?? path;
}
