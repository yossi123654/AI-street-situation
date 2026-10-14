"use client";

import { CloudIcon } from "@/components/icons";
import { Card, CardSkeleton, FreshnessBadge, SectionUnavailable } from "@/components/ui";
import { useI18n } from "@/i18n/I18nProvider";
import type { Section, WeatherData } from "@/lib/types";
import { describeWeatherCode } from "@/lib/weatherCodes";

export function WeatherCard({ section }: { section: Section<WeatherData> | undefined }) {
  const { t, formatNumber, formatDistance } = useI18n();
  return (
    <Card
      id="weather"
      title={t("weather.title")}
      icon={<CloudIcon />}
      actions={
        section?.status === "ok" ? (
          <FreshnessBadge freshness={section.freshness} time={section.data.source.observedAt} />
        ) : null
      }
    >
      {!section ? (
        <CardSkeleton />
      ) : section.status === "unavailable" ? (
        <SectionUnavailable section={section} />
      ) : (
        (() => {
          const w = section.data;
          const { key, emoji } = describeWeatherCode(w.weatherCode, w.isDay);
          const deg = (v: number | null) => (v === null ? "—" : `${formatNumber(Math.round(v))}°`);
          const stats: Array<[string, string]> = [
            [
              t("weather.humidity"),
              w.humidityPct === null ? "—" : `${formatNumber(w.humidityPct)}%`,
            ],
            [
              t("weather.wind"),
              w.windSpeedKmh === null
                ? "—"
                : t("units.kmh", { value: formatNumber(Math.round(w.windSpeedKmh)) }),
            ],
            [
              t("weather.precipitation"),
              w.precipitationMm === null
                ? "—"
                : t("units.mm", { value: formatNumber(w.precipitationMm) }),
            ],
            [t("weather.visibility"), w.visibilityM === null ? "—" : formatDistance(w.visibilityM)],
          ];
          return (
            <div data-testid="weather">
              <div className="flex items-center gap-3">
                <span className="text-4xl" aria-hidden="true">
                  {emoji}
                </span>
                <div>
                  <p className="text-3xl font-semibold tabular-nums">{deg(w.temperatureC)}</p>
                  <p className="text-sm text-slate-600 dark:text-slate-400">
                    {t(`wmo.${key}`)}
                    {w.apparentTemperatureC !== null
                      ? ` · ${t("weather.feelsLike", { value: deg(w.apparentTemperatureC) })}`
                      : ""}
                  </p>
                </div>
              </div>
              <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
                {stats.map(([label, value]) => (
                  <div
                    key={label}
                    className="flex justify-between gap-2 border-b border-slate-100 pb-1 dark:border-slate-800"
                  >
                    <dt className="text-slate-500">{label}</dt>
                    <dd className="font-medium tabular-nums">{value}</dd>
                  </div>
                ))}
              </dl>
            </div>
          );
        })()
      )}
    </Card>
  );
}
