"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { CodeIcon, GlobeIcon, LogoIcon } from "@/components/icons";
import { LOCALE_COOKIE, LOCALES, isLocale } from "@/i18n/config";
import { useI18n } from "@/i18n/I18nProvider";

export function Header() {
  const { t, locale } = useI18n();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const changeLocale = (next: string) => {
    if (!isLocale(next) || next === locale) return;
    document.cookie = `${LOCALE_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
    startTransition(() => router.refresh());
  };

  return (
    <header className="bg-white dark:bg-slate-900">
      <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-3">
        <LogoIcon className="shrink-0 text-3xl text-brand-600" />
        <div className="min-w-0">
          <h1 className="text-lg leading-tight font-bold">{t("app.title")}</h1>
          <p className="hidden truncate text-sm text-slate-500 sm:block dark:text-slate-400">
            {t("app.tagline")}
          </p>
        </div>
        <div className="ms-auto flex items-center gap-1">
          <label className="relative flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800">
            <GlobeIcon aria-hidden="true" />
            <span className="sr-only">{t("app.language")}</span>
            <select
              value={locale}
              onChange={(event) => changeLocale(event.target.value)}
              disabled={pending}
              className="cursor-pointer appearance-none bg-transparent pe-1 font-medium focus:outline-none"
              data-testid="language-select"
            >
              {Object.entries(LOCALES).map(([code, { label }]) => (
                <option key={code} value={code}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <a
            href="https://github.com/yossi123654/ai-street-situation"
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
            title={t("app.github")}
          >
            <CodeIcon className="text-lg" />
            <span className="sr-only">{t("app.github")}</span>
          </a>
        </div>
      </div>
    </header>
  );
}
