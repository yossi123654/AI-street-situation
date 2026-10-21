"use client";

import type { ReactNode } from "react";
import { AlertIcon, InfoIcon } from "@/components/icons";
import { useI18n } from "@/i18n/I18nProvider";
import type { Freshness, Section } from "@/lib/types";

export function cx(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ");
}

export function Card({
  title,
  icon,
  actions,
  children,
  className,
  id,
}: {
  title: string;
  icon?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  id?: string;
}) {
  const headingId = id ? `${id}-title` : undefined;
  return (
    <section
      id={id}
      aria-labelledby={headingId}
      className={cx(
        "rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900",
        className,
      )}
    >
      <header className="mb-3 flex items-center gap-2">
        {icon ? <span className="text-lg text-brand-600 dark:text-brand-500">{icon}</span> : null}
        <h2 id={headingId} className="text-base font-semibold">
          {title}
        </h2>
        {actions ? <div className="ms-auto flex items-center gap-2">{actions}</div> : null}
      </header>
      {children}
    </section>
  );
}

const FRESHNESS_STYLES: Record<Freshness, string> = {
  live: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  recent: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  stale: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
  unknown: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
};

export function FreshnessBadge({ freshness, time }: { freshness: Freshness; time?: string }) {
  const { t, formatRelative } = useI18n();
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap",
        FRESHNESS_STYLES[freshness],
      )}
      title={time ? new Date(time).toLocaleString() : undefined}
    >
      <span
        aria-hidden="true"
        className={cx("size-1.5 rounded-full bg-current", freshness === "live" && "animate-pulse")}
      />
      {t(`freshness.${freshness}`)}
      {time ? <span className="font-normal opacity-80">· {formatRelative(time)}</span> : null}
    </span>
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cx(
        "inline-block size-4 animate-spin rounded-full border-2 border-current border-e-transparent",
        className,
      )}
    />
  );
}

export function Notice({
  tone = "info",
  children,
}: {
  tone?: "info" | "warning" | "error";
  children: ReactNode;
}) {
  const styles = {
    info: "bg-slate-50 text-slate-700 border-slate-200 dark:bg-slate-800/50 dark:text-slate-300 dark:border-slate-700",
    warning:
      "bg-amber-50 text-amber-900 border-amber-200 dark:bg-amber-950/40 dark:text-amber-200 dark:border-amber-900",
    error:
      "bg-red-50 text-red-900 border-red-200 dark:bg-red-950/40 dark:text-red-200 dark:border-red-900",
  }[tone];
  return (
    <div
      className={cx("flex gap-2 rounded-xl border p-3 text-sm", styles)}
      role={tone === "error" ? "alert" : undefined}
    >
      <span className="mt-0.5 shrink-0">{tone === "info" ? <InfoIcon /> : <AlertIcon />}</span>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return (
    <div className={cx("animate-pulse rounded-lg bg-slate-200 dark:bg-slate-800", className)} />
  );
}

export function CardSkeleton() {
  return (
    <div className="space-y-2" aria-hidden="true">
      <Skeleton className="h-6 w-1/2" />
      <Skeleton className="h-4 w-3/4" />
      <Skeleton className="h-4 w-2/3" />
    </div>
  );
}

/** Standard rendering for a section that has no data. */
export function SectionUnavailable({
  section,
}: {
  section: Extract<Section<unknown>, { status: "unavailable" }>;
}) {
  const { t } = useI18n();
  if (section.reason === "not_configured") {
    return (
      <Notice>
        <p>{t("section.notConfigured")}</p>
        <p className="mt-1 text-xs opacity-80">{t("section.notConfiguredHint")}</p>
      </Notice>
    );
  }
  if (section.reason === "no_data") return <Notice>{t("section.noData")}</Notice>;
  if (section.reason === "not_live") return <Notice>{t("section.notLive")}</Notice>;
  return <Notice tone="warning">{t("section.error")}</Notice>;
}
