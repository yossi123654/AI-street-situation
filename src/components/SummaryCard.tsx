"use client";

import { SparkIcon } from "@/components/icons";
import { Card, CardSkeleton, Notice, Spinner, cx } from "@/components/ui";
import { useI18n } from "@/i18n/I18nProvider";
import { describeWeatherCode } from "@/lib/weatherCodes";
import type { AiSummary, Confidence, SituationReport } from "@/lib/types";

export type SummaryState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ok"; data: AiSummary }
  | { status: "not_configured" }
  | { status: "error" };

const CONFIDENCE_STYLE: Record<Confidence, string> = {
  high: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  medium: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  low: "bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
};

/** Deterministic one-line facts, shown with or without AI. */
function useOverview(report: SituationReport) {
  const { t, formatNumber, formatDistance } = useI18n();
  const lines: string[] = [];
  const w = report.weather;
  if (w.status === "ok" && w.data.temperatureC !== null) {
    const { key } = describeWeatherCode(w.data.weatherCode, w.data.isDay);
    lines.push(
      t("weather.overview", {
        temp: `${formatNumber(Math.round(w.data.temperatureC))}°`,
        condition: t(`wmo.${key}`),
      }),
    );
  }
  const tr = report.traffic;
  if (tr.status === "ok" && tr.data[0])
    lines.push(t("traffic.overview", { level: t(`traffic.level.${tr.data[0].level}`) }));
  const inc = report.incidents;
  if (inc.status === "ok") {
    lines.push(
      inc.data.length > 0
        ? t("incidents.overview", { count: inc.data.length })
        : t("incidents.overviewNone"),
    );
  }
  const cams = report.cameras;
  if (cams.status === "ok" && cams.data.length > 0) {
    lines.push(
      `${t("cameras.overview", { count: cams.data.length })} · ${formatDistance(cams.data[0]!.distanceM)}`,
    );
  }
  return lines;
}

export function SummaryCard({
  report,
  summary,
}: {
  report: SituationReport | undefined;
  summary: SummaryState;
  cameraRadiusM: number;
}) {
  const { t } = useI18n();
  return (
    <Card
      id="summary"
      title={t("summary.title")}
      icon={<SparkIcon />}
      actions={
        report ? (
          <span
            className={cx(
              "rounded-full px-2.5 py-0.5 text-xs font-medium",
              CONFIDENCE_STYLE[report.confidence],
            )}
            data-testid="confidence"
          >
            {t("confidence.label")}: {t(`confidence.${report.confidence}`)}
          </span>
        ) : null
      }
      className="border-brand-100 bg-gradient-to-b from-brand-50/60 to-white dark:border-slate-800 dark:from-slate-900 dark:to-slate-900"
    >
      {!report ? <CardSkeleton /> : <SummaryBody report={report} summary={summary} />}
    </Card>
  );
}

function SummaryBody({ report, summary }: { report: SituationReport; summary: SummaryState }) {
  const { t } = useI18n();
  const overview = useOverview(report);
  return (
    <div className="space-y-4">
      <div data-testid="ai-summary">
        {summary.status === "loading" ? (
          <p className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
            <Spinner /> {t("summary.generating")}
          </p>
        ) : summary.status === "ok" ? (
          <div className="space-y-2">
            <p className="text-[15px] leading-relaxed">{summary.data.text}</p>
            {summary.data.cameraAnalyses.length > 0 ? (
              <p className="text-xs text-slate-500">
                {t("summary.basedOnCamera", {
                  camera: summary.data.cameraAnalyses.map((a) => a.cameraName).join(", "),
                })}
              </p>
            ) : null}
            <p className="text-xs text-slate-500">
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

      {overview.length > 0 ? (
        <div>
          <h3 className="mb-1.5 text-xs font-semibold tracking-wide text-slate-500 uppercase">
            {t("summary.overview")}
          </h3>
          <ul className="flex flex-wrap gap-2 text-sm">
            {overview.map((line) => (
              <li
                key={line}
                className="rounded-lg bg-white px-2.5 py-1 shadow-sm ring-1 ring-slate-200 dark:bg-slate-800 dark:ring-slate-700"
              >
                {line}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {report.missing.length > 0 ? (
        <div data-testid="missing">
          <h3 className="mb-1.5 text-xs font-semibold tracking-wide text-slate-500 uppercase">
            {t("missing.title")}
          </h3>
          <ul className="flex flex-wrap gap-2 text-xs">
            {report.missing.map((code) => (
              <li
                key={code}
                className={cx(
                  "rounded-full px-2.5 py-1",
                  code.endsWith("_stale")
                    ? "bg-red-50 text-red-800 dark:bg-red-950/50 dark:text-red-300"
                    : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
                )}
              >
                {t(`missing.${code}`)}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
