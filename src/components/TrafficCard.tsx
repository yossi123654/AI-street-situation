"use client";

import { CarIcon } from "@/components/icons";
import { Card, CardSkeleton, FreshnessBadge, SectionUnavailable, cx } from "@/components/ui";
import { useI18n } from "@/i18n/I18nProvider";
import type { Section, TrafficFlow, TrafficLevel } from "@/lib/types";

const LEVEL_STYLE: Record<TrafficLevel, { bar: string; text: string }> = {
  free: { bar: "bg-emerald-500", text: "text-emerald-700 dark:text-emerald-400" },
  moderate: { bar: "bg-amber-400", text: "text-amber-700 dark:text-amber-400" },
  heavy: { bar: "bg-orange-500", text: "text-orange-700 dark:text-orange-400" },
  severe: { bar: "bg-red-600", text: "text-red-700 dark:text-red-400" },
  closed: { bar: "bg-slate-900 dark:bg-slate-100", text: "text-slate-900 dark:text-slate-100" },
  unknown: { bar: "bg-slate-300", text: "text-slate-500" },
};

export function TrafficCard({ section }: { section: Section<TrafficFlow[]> | undefined }) {
  const { t, formatNumber } = useI18n();
  return (
    <Card
      id="traffic"
      title={t("traffic.title")}
      icon={<CarIcon />}
      actions={
        section?.status === "ok" ? (
          <FreshnessBadge freshness={section.freshness} time={section.data[0]?.source.observedAt} />
        ) : null
      }
    >
      {!section ? (
        <CardSkeleton />
      ) : section.status === "unavailable" ? (
        <SectionUnavailable section={section} />
      ) : (
        <ul className="space-y-3" data-testid="traffic">
          {section.data.map((flow, index) => {
            const style = LEVEL_STYLE[flow.level];
            return (
              <li key={`${flow.roadName ?? "road"}-${index}`}>
                <div className="flex items-baseline justify-between gap-2">
                  <span className="truncate text-sm text-slate-600 dark:text-slate-400">
                    {flow.roadName ?? t("traffic.nearestRoad")}
                  </span>
                  <span className={cx("text-sm font-semibold", style.text)}>
                    {t(`traffic.level.${flow.level}`)}
                  </span>
                </div>
                <div
                  className="mt-1.5 h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800"
                  role="presentation"
                >
                  <div
                    className={cx("h-full rounded-full transition-all", style.bar)}
                    style={{ width: `${Math.round(Math.max(0.06, flow.congestion ?? 0) * 100)}%` }}
                  />
                </div>
                {flow.currentSpeedKmh !== null && flow.freeFlowSpeedKmh !== null ? (
                  <p className="mt-1 text-xs text-slate-500 tabular-nums">
                    {t("traffic.speed", {
                      current: formatNumber(flow.currentSpeedKmh),
                      free: formatNumber(flow.freeFlowSpeedKmh),
                    })}
                  </p>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
