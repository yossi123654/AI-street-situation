"use client";

import { AlertIcon } from "@/components/icons";
import { Card, CardSkeleton, FreshnessBadge, SectionUnavailable, cx } from "@/components/ui";
import { useI18n } from "@/i18n/I18nProvider";
import type { Incident, IncidentSeverity, Section } from "@/lib/types";

const SEVERITY_STYLE: Record<IncidentSeverity, string> = {
  major: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
  moderate: "bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300",
  minor: "bg-yellow-100 text-yellow-800 dark:bg-yellow-950 dark:text-yellow-300",
  unknown: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
};

const INCIDENT_RADIUS_M = 2000;

export function IncidentsCard({
  section,
  along = false,
}: {
  section: Section<Incident[]> | undefined;
  /** Trip mode: distances are kilometres along the route, not distance from the point. */
  along?: boolean;
}) {
  const { t, formatDistance, formatTime, formatNumber } = useI18n();
  const radius = formatDistance(INCIDENT_RADIUS_M);
  return (
    <Card
      id="incidents"
      title={along ? t("trip.incidentsTitle") : t("incidents.title")}
      icon={<AlertIcon />}
      actions={
        section?.status === "ok" ? (
          <FreshnessBadge
            freshness={section.freshness}
            time={section.sources[0]?.observedAt ?? section.sources[0]?.fetchedAt}
          />
        ) : null
      }
    >
      {!section ? (
        <CardSkeleton />
      ) : section.status === "unavailable" ? (
        <SectionUnavailable section={section} />
      ) : section.data.length === 0 ? (
        <p className="text-sm text-slate-600 dark:text-slate-400">
          {t("incidents.none", { radius })}
        </p>
      ) : (
        <>
          <p className="mb-2 text-sm text-slate-500">
            {t("incidents.count", { count: section.data.length, radius })}
          </p>
          <ul className="divide-y divide-slate-100 dark:divide-slate-800" data-testid="incidents">
            {section.data.map((incident) => (
              <li key={incident.id} className="flex gap-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="font-medium">{t(`incidents.type.${incident.type}`)}</span>
                    <span
                      className={cx(
                        "rounded-full px-2 py-0.5 text-xs",
                        SEVERITY_STYLE[incident.severity],
                      )}
                    >
                      {t(`incidents.severity.${incident.severity}`)}
                    </span>
                    {incident.roadClosed ? (
                      <span className="rounded-full bg-slate-900 px-2 py-0.5 text-xs text-white dark:bg-slate-100 dark:text-slate-900">
                        {t("incidents.roadClosed")}
                      </span>
                    ) : null}
                  </div>
                  {incident.description ? (
                    <p className="mt-0.5 text-sm text-slate-700 dark:text-slate-300">
                      {incident.description}
                    </p>
                  ) : null}
                  <p className="mt-0.5 text-xs text-slate-500">
                    {[
                      incident.roadName,
                      incident.endTime
                        ? t("incidents.until", { time: formatTime(incident.endTime) })
                        : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </div>
                {incident.distanceM !== undefined ? (
                  <span className="shrink-0 text-xs whitespace-nowrap text-slate-500 tabular-nums">
                    {along
                      ? t("trip.alongAt", {
                          km: formatNumber(Math.round(incident.distanceM / 1000)),
                        })
                      : t("incidents.away", { distance: formatDistance(incident.distanceM) })}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        </>
      )}
    </Card>
  );
}
