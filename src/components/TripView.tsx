"use client";

import { useState } from "react";
import { IncidentsCard } from "@/components/IncidentsCard";
import {
  CarIcon,
  ClockIcon,
  CloudIcon,
  FuelIcon,
  NavigateIcon,
  RouteIcon,
  SparkIcon,
} from "@/components/icons";
import { ParkingCard } from "@/components/ParkingCard";
import type { SummaryState } from "@/components/SummaryCard";
import {
  Card,
  CardSkeleton,
  FreshnessBadge,
  Notice,
  SectionUnavailable,
  Spinner,
  cx,
} from "@/components/ui";
import { useI18n } from "@/i18n/I18nProvider";
import type {
  Confidence,
  IncidentSeverity,
  RoutePointWeather,
  RouteTrafficSample,
  RouteTrafficSection,
  Section,
  TrafficLevel,
  TripReport,
  TripStop,
} from "@/lib/types";
import { describeWeatherCode } from "@/lib/weatherCodes";

const CONFIDENCE_STYLE: Record<Confidence, string> = {
  high: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  medium: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  low: "bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
};

const SEVERITY_BAR: Record<IncidentSeverity, string> = {
  major: "bg-red-600",
  moderate: "bg-orange-500",
  minor: "bg-amber-400",
  unknown: "bg-slate-400",
};

const LEVEL_TEXT: Record<TrafficLevel, string> = {
  free: "text-emerald-700 dark:text-emerald-400",
  moderate: "text-amber-700 dark:text-amber-400",
  heavy: "text-orange-700 dark:text-orange-400",
  severe: "text-red-700 dark:text-red-400",
  closed: "text-slate-900 dark:text-slate-100",
  unknown: "text-slate-500",
};

/** Overview: distance, time, ETA, traffic delay and the main roads. */
export function TripOverviewCard({
  report,
  summary,
  parkingRadiusM,
}: {
  report: TripReport | undefined;
  summary: SummaryState;
  parkingRadiusM: number;
}) {
  const { t, formatDistance, formatDuration, formatClock, formatNumber, formatTime } = useI18n();
  void parkingRadiusM;
  if (!report) {
    return (
      <Card id="trip-overview" title={t("trip.overview")} icon={<RouteIcon />}>
        <CardSkeleton />
      </Card>
    );
  }
  const route = report.route;
  return (
    <Card
      id="trip-overview"
      title={t("trip.overview")}
      icon={<RouteIcon />}
      actions={
        <span
          className={cx(
            "rounded-full px-2.5 py-0.5 text-xs font-medium",
            CONFIDENCE_STYLE[report.confidence],
          )}
          data-testid="trip-confidence"
        >
          {t("confidence.label")}: {t(`confidence.${report.confidence}`)}
        </span>
      }
      className="border-brand-100 bg-gradient-to-b from-brand-50/60 to-white dark:border-slate-800 dark:from-slate-900 dark:to-slate-900"
    >
      {route.status !== "ok" ? (
        <SectionUnavailable section={route} />
      ) : (
        <div className="space-y-4" data-testid="trip-overview">
          <dl className="grid grid-cols-3 gap-3 text-center">
            {[
              [t("trip.distance"), formatDistance(route.data.distanceM)],
              [t("trip.duration"), formatDuration(route.data.durationS)],
              [
                t("trip.eta"),
                formatClock(
                  new Date(
                    Date.parse(report.departureTime) + route.data.durationS * 1000,
                  ).toISOString(),
                ),
              ],
            ].map(([label, value]) => (
              <div
                key={label}
                className="rounded-xl bg-white px-2 py-2.5 shadow-sm ring-1 ring-slate-200 dark:bg-slate-800 dark:ring-slate-700"
              >
                <dt className="text-xs text-slate-500">{label}</dt>
                <dd className="text-xl font-semibold tabular-nums">{value}</dd>
              </div>
            ))}
          </dl>
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
            <ClockIcon className="text-slate-400" />
            <span className="text-slate-600 dark:text-slate-400" data-testid="trip-departure">
              {report.departureIsNow
                ? t("trip.departNow")
                : t("trip.departAt", { time: formatTime(report.departureTime) })}
              .
            </span>
            {route.data.trafficAware ? (
              <>
                <span className="font-medium text-emerald-700 dark:text-emerald-400">
                  {route.data.trafficKind === "predicted"
                    ? t("trip.withPredictedTraffic")
                    : t("trip.withTraffic")}
                  .
                </span>
                <span className="text-slate-600 dark:text-slate-400">
                  {route.data.trafficDelayS && route.data.trafficDelayS >= 120
                    ? t(
                        route.data.trafficKind === "predicted"
                          ? "trip.predictedDelay"
                          : "trip.delay",
                        {
                          minutes: formatNumber(Math.round(route.data.trafficDelayS / 60)),
                        },
                      )
                    : t("trip.noDelay")}
                </span>
              </>
            ) : (
              <span className="text-amber-800 dark:text-amber-300">
                {t("trip.withoutTraffic")}.
              </span>
            )}
          </p>
          {route.data.roads.length > 0 ? (
            <p className="text-sm">
              <span className="text-slate-500">{t("trip.via")}: </span>
              {route.data.steps.map((step, i) => (
                <span key={`${step.name}-${i}`}>
                  {i > 0 ? <span className="text-slate-400"> › </span> : null}
                  <span className="font-medium">{step.name}</span>
                  <span className="text-xs text-slate-500">
                    {" "}
                    ({formatDistance(step.distanceM)})
                  </span>
                </span>
              ))}
            </p>
          ) : null}
          <p className="text-xs text-slate-500">
            {t("trip.routeBy", { provider: route.data.source.name })} ·{" "}
            {route.data.source.attribution} ·{" "}
            <a
              href="https://www.openstreetmap.org/fixthemap"
              target="_blank"
              rel="noopener noreferrer"
              className="underline"
            >
              {t("trip.fixMap")}
            </a>
          </p>

          <div data-testid="trip-ai-summary">
            {summary.status === "loading" ? (
              <p className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
                <Spinner /> {t("trip.generating")}
              </p>
            ) : summary.status === "ok" ? (
              <div className="rounded-xl bg-white p-3 shadow-sm ring-1 ring-slate-200 dark:bg-slate-800 dark:ring-slate-700">
                <p className="mb-1 flex items-center gap-1.5 text-sm font-semibold">
                  <SparkIcon className="text-brand-600" /> {t("trip.summaryTitle")}
                </p>
                <p className="text-[15px] leading-relaxed">{summary.data.text}</p>
                <p className="mt-2 text-xs text-slate-500">
                  {t("summary.generatedBy", {
                    provider: summary.data.provider.name,
                    model: summary.data.provider.model,
                  })}
                </p>
              </div>
            ) : summary.status === "not_configured" ? (
              <Notice>
                <p>{t("summary.notConfigured")}</p>
                <p className="mt-1 text-xs opacity-80">{t("summary.notConfiguredHint")}</p>
              </Notice>
            ) : summary.status === "error" ? (
              <Notice tone="warning">{t("summary.error")}</Notice>
            ) : null}
          </div>

          {report.missing.length > 0 ? (
            <ul className="flex flex-wrap gap-2 text-xs" data-testid="trip-missing">
              {report.missing.map((code) => (
                <li
                  key={code}
                  className="rounded-full bg-slate-100 px-2.5 py-1 text-slate-600 dark:bg-slate-800 dark:text-slate-300"
                >
                  {t(`trip.missing.${code}`)}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      )}
    </Card>
  );
}

/** Weather at each sampled point, as a horizontal timeline. */
export function WeatherAlongCard({
  section,
}: {
  section: Section<RoutePointWeather[]> | undefined;
}) {
  const { t, formatNumber, formatClock } = useI18n();
  return (
    <Card id="trip-weather" title={t("trip.weatherTitle")} icon={<CloudIcon />}>
      {!section ? (
        <CardSkeleton />
      ) : section.status !== "ok" ? (
        <SectionUnavailable section={section} />
      ) : (
        <div data-testid="trip-weather">
          <ol className="flex gap-2 overflow-x-auto pb-2">
            {section.data.map((p) => {
              const { key, emoji } = describeWeatherCode(p.weatherCode, p.isDay);
              return (
                <li
                  key={p.distanceAlongM}
                  className="flex min-w-[6.5rem] shrink-0 flex-col items-center rounded-xl border border-slate-200 px-2 py-2 text-center dark:border-slate-800"
                >
                  <span className="text-xs text-slate-500">
                    {t("trip.atKm", { km: formatNumber(Math.round(p.distanceAlongM / 1000)) })}
                  </span>
                  <span className="text-2xl" aria-hidden="true">
                    {emoji}
                  </span>
                  <span className="text-lg font-semibold tabular-nums">
                    {p.temperatureC === null ? "—" : `${formatNumber(Math.round(p.temperatureC))}°`}
                  </span>
                  <span className="text-xs text-slate-600 dark:text-slate-400">
                    {t(`wmo.${key}`)}
                  </span>
                  {p.precipitationMm ? (
                    <span className="text-xs text-sky-700 dark:text-sky-400">
                      {t("units.mm", { value: formatNumber(p.precipitationMm) })}
                    </span>
                  ) : null}
                  <span className="mt-1 text-[11px] text-slate-500">
                    {formatClock(p.forecastFor)} ·{" "}
                    {p.kind === "current" ? t("trip.current") : t("trip.forecast")}
                  </span>
                  {p.roadName ? (
                    <span
                      className="mt-0.5 max-w-full truncate text-[11px] text-slate-400"
                      title={p.roadName}
                    >
                      {p.roadName}
                    </span>
                  ) : null}
                </li>
              );
            })}
          </ol>
          <p className="mt-1 text-xs text-slate-500">{t("trip.weatherHint")}</p>
        </div>
      )}
    </Card>
  );
}

/** Slow sections from a traffic-aware router, or sampled flow otherwise. */
export function TrafficAlongCard({
  section,
  totalM,
}: {
  section: Section<{ sections: RouteTrafficSection[]; samples: RouteTrafficSample[] }> | undefined;
  totalM: number;
}) {
  const { t, formatNumber, formatDistance } = useI18n();
  return (
    <Card
      id="trip-traffic"
      title={t("trip.trafficTitle")}
      icon={<CarIcon />}
      actions={
        section?.status === "ok" ? (
          <FreshnessBadge freshness={section.freshness} time={section.sources[0]?.observedAt} />
        ) : null
      }
    >
      {!section ? (
        <CardSkeleton />
      ) : section.status !== "ok" ? (
        <SectionUnavailable section={section} />
      ) : section.data.sections.length > 0 ? (
        <div data-testid="trip-traffic">
          <p className="mb-2 text-sm text-slate-500">
            {t("trip.trafficSections", {
              count: section.data.sections.length,
              minutes: formatNumber(
                Math.round(section.data.sections.reduce((sum, s) => sum + s.delayS, 0) / 60),
              ),
            })}
          </p>
          {/* Route bar with slow sections marked */}
          <div
            className="relative mb-3 h-2.5 overflow-hidden rounded-full bg-emerald-200 dark:bg-emerald-900"
            role="presentation"
          >
            {section.data.sections.map((s) => (
              <span
                key={`${s.startIndex}-${s.endIndex}`}
                className={cx("absolute top-0 h-full", SEVERITY_BAR[s.severity])}
                style={{
                  insetInlineStart: `${(s.distanceAlongM / Math.max(1, totalM)) * 100}%`,
                  width: `${Math.max(0.8, (s.lengthM / Math.max(1, totalM)) * 100)}%`,
                }}
              />
            ))}
          </div>
          <ul className="divide-y divide-slate-100 text-sm dark:divide-slate-800">
            {section.data.sections.map((s) => (
              <li
                key={`${s.startIndex}-${s.endIndex}-row`}
                className="flex items-center justify-between gap-2 py-1.5"
              >
                <span>
                  <span
                    className={cx(
                      "me-1.5 inline-block size-2 rounded-full align-middle",
                      SEVERITY_BAR[s.severity],
                    )}
                  />
                  <span className="font-medium">{t(`trip.category.${s.category}`)}</span>
                  <span className="text-slate-500">
                    {" "}
                    ·{" "}
                    {t("trip.sectionAt", {
                      km: formatNumber(Math.round(s.distanceAlongM / 1000)),
                      length: formatDistance(s.lengthM),
                    })}
                  </span>
                </span>
                <span className="shrink-0 text-xs text-slate-500 tabular-nums">
                  {s.effectiveSpeedKmh !== null
                    ? `${t("trip.effectiveSpeed", { speed: formatNumber(s.effectiveSpeedKmh) })} · `
                    : ""}
                  {t("units.minutes", { value: formatNumber(Math.round(s.delayS / 60)) })}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : section.data.samples.length > 0 ? (
        <div data-testid="trip-traffic">
          <p className="mb-2 text-sm text-slate-500">
            {t("trip.trafficSampled", { count: section.data.samples.length })}
          </p>
          <ul className="divide-y divide-slate-100 text-sm dark:divide-slate-800">
            {section.data.samples.map((s) => (
              <li key={s.distanceAlongM} className="flex items-center justify-between gap-2 py-1.5">
                <span>
                  <span className="text-slate-500">
                    {t("trip.atKm", { km: formatNumber(Math.round(s.distanceAlongM / 1000)) })}
                  </span>
                  {s.roadName ? (
                    <span className="text-slate-600 dark:text-slate-400"> · {s.roadName}</span>
                  ) : null}
                </span>
                <span className={cx("font-medium", LEVEL_TEXT[s.flow.level])}>
                  {t(`traffic.level.${s.flow.level}`)}
                  {s.flow.currentSpeedKmh !== null ? (
                    <span className="text-xs font-normal text-slate-500">
                      {" "}
                      · {t("trip.effectiveSpeed", { speed: formatNumber(s.flow.currentSpeedKmh) })}
                    </span>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="text-sm text-emerald-700 dark:text-emerald-400" data-testid="trip-traffic">
          {t("trip.trafficClear")}
        </p>
      )}
    </Card>
  );
}

type StopFilter = "all" | "fuel" | "rest";

export function StopsCard({
  section,
  loading,
  selectedId,
  onSelect,
}: {
  section: Section<TripStop[]> | undefined;
  loading: boolean;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const { t, formatNumber, formatDistance } = useI18n();
  const [filter, setFilter] = useState<StopFilter>("all");
  const all = section?.status === "ok" ? section.data : [];
  const items = all.filter((s) =>
    filter === "all"
      ? true
      : filter === "fuel"
        ? s.kind === "fuel" || s.kind === "charging"
        : s.kind === "rest_area" || s.kind === "services",
  );
  return (
    <Card id="trip-stops" title={t("trip.stopsTitle")} icon={<FuelIcon />}>
      {loading && !section ? (
        <div className="space-y-3">
          <p className="flex items-center gap-2 text-sm text-slate-500">
            <Spinner /> {t("trip.stopsLoading")}
          </p>
          <CardSkeleton />
        </div>
      ) : !section ? null : section.status !== "ok" ? (
        <SectionUnavailable section={section} />
      ) : all.length === 0 ? (
        <Notice>{t("trip.stopsNone")}</Notice>
      ) : (
        <div className="space-y-3" data-testid="trip-stops">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-slate-500">{t("trip.stopsCount", { count: all.length })}</p>
            <div
              role="group"
              aria-label={t("trip.stopsFilter.label")}
              className="flex gap-1 rounded-lg bg-slate-100 p-0.5 text-xs dark:bg-slate-800"
            >
              {(["all", "fuel", "rest"] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={filter === value}
                  onClick={() => setFilter(value)}
                  className={cx(
                    "rounded-md px-2.5 py-1 font-medium",
                    filter === value
                      ? "bg-white text-slate-900 shadow-sm dark:bg-slate-950 dark:text-slate-100"
                      : "text-slate-600 hover:text-slate-900 dark:text-slate-400",
                  )}
                >
                  {t(`trip.stopsFilter.${value}`)}
                </button>
              ))}
            </div>
          </div>
          <ul className="max-h-96 space-y-1.5 overflow-y-auto pe-1" data-testid="trip-stops-list">
            {items.map((stop) => {
              const selected = stop.id === selectedId;
              const destination = `${stop.lat.toFixed(6)},${stop.lon.toFixed(6)}`;
              return (
                <li
                  key={stop.id}
                  data-stop-id={stop.id}
                  className={cx(
                    "rounded-xl border px-3 py-2",
                    selected
                      ? "border-brand-500 bg-brand-50 dark:bg-slate-800"
                      : "border-slate-200 dark:border-slate-800",
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => onSelect(stop.id)}
                      aria-pressed={selected}
                      className="min-w-0 text-start"
                    >
                      <span className="block text-sm font-medium">
                        {stop.name ?? stop.brand ?? t(`trip.stopKind.${stop.kind}`)}
                      </span>
                      <span className="mt-1 flex flex-wrap gap-1.5 text-xs">
                        <span className="rounded bg-slate-100 px-1.5 py-0.5 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                          {t(`trip.stopKind.${stop.kind}`)}
                        </span>
                        {stop.brand && stop.name ? (
                          <span className="text-slate-500">{stop.brand}</span>
                        ) : null}
                        {stop.facilities.map((f) => (
                          <span
                            key={f}
                            className="rounded bg-emerald-50 px-1.5 py-0.5 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                          >
                            {t(`trip.facility.${f}`)}
                          </span>
                        ))}
                      </span>
                    </button>
                    <span className="shrink-0 text-end text-xs text-slate-500 tabular-nums">
                      <span className="block font-medium text-slate-700 dark:text-slate-300">
                        {t("trip.atKm", {
                          km: formatNumber(Math.round(stop.distanceAlongM / 1000)),
                        })}
                      </span>
                      {stop.detourM > 50 ? (
                        <span>{t("trip.detour", { distance: formatDistance(stop.detourM) })}</span>
                      ) : null}
                    </span>
                  </div>
                  <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                    {stop.openingHours ? (
                      <span className="text-slate-500" dir="auto">
                        {t("parking.hours", { hours: stop.openingHours })}
                      </span>
                    ) : null}
                    <span className="inline-flex items-center gap-1 text-slate-500">
                      <NavigateIcon /> {t("parking.navigate")}:
                    </span>
                    <a
                      className="font-medium text-brand-700 hover:underline dark:text-brand-500"
                      href={`https://waze.com/ul?ll=${destination}&navigate=yes`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Waze
                    </a>
                    <a
                      className="font-medium text-brand-700 hover:underline dark:text-brand-500"
                      href={`https://www.google.com/maps/dir/?api=1&destination=${destination}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Google Maps
                    </a>
                  </p>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </Card>
  );
}

/** All trip cards below the overview. */
export function TripDetails({
  report,
  stops,
  stopsLoading,
  selectedStopId,
  onSelectStop,
  parkingRadiusM,
  selectedParkingId,
  onSelectParking,
}: {
  report: TripReport | undefined;
  stops: Section<TripStop[]> | undefined;
  stopsLoading: boolean;
  selectedStopId: string | null;
  onSelectStop: (id: string) => void;
  parkingRadiusM: number;
  selectedParkingId: string | null;
  onSelectParking: (id: string) => void;
}) {
  const { t } = useI18n();
  const totalM = report?.route.status === "ok" ? report.route.data.distanceM : 0;
  return (
    <>
      <WeatherAlongCard section={report?.weatherAlong} />
      <TrafficAlongCard section={report?.trafficAlong} totalM={totalM} />
      <IncidentsCard section={report?.incidents} along />
      <StopsCard
        section={stops}
        loading={stopsLoading}
        selectedId={selectedStopId}
        onSelect={onSelectStop}
      />
      <ParkingCard
        section={report?.destinationParking}
        loading={!report}
        radiusM={parkingRadiusM}
        selectedId={selectedParkingId}
        onSelect={onSelectParking}
        title={t("trip.parkingTitle")}
      />
    </>
  );
}
