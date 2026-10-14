"use client";

import { createContext, useCallback, useContext, useMemo, type ReactNode } from "react";
import { LOCALES, translate, type MessageKey } from "@/i18n/config";
import type { Locale } from "@/lib/types";

interface I18nValue {
  locale: Locale;
  dir: "rtl" | "ltr";
  t: (key: MessageKey, vars?: Record<string, string | number>) => string;
  formatNumber: (value: number, options?: Intl.NumberFormatOptions) => string;
  formatDistance: (meters: number) => string;
  formatRelative: (iso: string | undefined, now?: number) => string;
  formatTime: (iso: string) => string;
  formatDuration: (seconds: number) => string;
}

const I18nContext = createContext<I18nValue | null>(null);

export function I18nProvider({ locale, children }: { locale: Locale; children: ReactNode }) {
  const { messages, dir } = LOCALES[locale];
  const t = useCallback<I18nValue["t"]>((key, vars) => translate(messages, key, vars), [messages]);

  const value = useMemo<I18nValue>(() => {
    const intlLocale = locale === "he" ? "he-IL" : "en-GB";
    const formatNumber = (value: number, options?: Intl.NumberFormatOptions) =>
      new Intl.NumberFormat(intlLocale, options).format(value);
    const relative = new Intl.RelativeTimeFormat(intlLocale, { numeric: "auto" });
    return {
      locale,
      dir,
      t,
      formatNumber,
      formatDistance: (meters) =>
        meters >= 1000
          ? t("units.km", { value: formatNumber(meters / 1000, { maximumFractionDigits: 1 }) })
          : t("units.m", { value: formatNumber(Math.round(meters / 10) * 10) }),
      formatRelative: (iso, now = Date.now()) => {
        if (!iso) return "";
        const diffSeconds = (Date.parse(iso) - now) / 1000;
        const abs = Math.abs(diffSeconds);
        if (abs < 45) return t("time.justNow");
        if (abs < 3600) return relative.format(Math.round(diffSeconds / 60), "minute");
        if (abs < 86400) return relative.format(Math.round(diffSeconds / 3600), "hour");
        return relative.format(Math.round(diffSeconds / 86400), "day");
      },
      formatTime: (iso) =>
        new Intl.DateTimeFormat(intlLocale, {
          hour: "2-digit",
          minute: "2-digit",
          day: "numeric",
          month: "short",
        }).format(new Date(iso)),
      formatDuration: (seconds) =>
        seconds >= 60
          ? t("units.minutes", { value: formatNumber(Math.round(seconds / 60)) })
          : t("units.seconds", { value: formatNumber(seconds) }),
    };
  }, [locale, dir, t]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const value = useContext(I18nContext);
  if (!value) throw new Error("useI18n must be used inside <I18nProvider>");
  return value;
}
