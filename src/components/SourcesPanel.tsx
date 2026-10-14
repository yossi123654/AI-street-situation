"use client";

import { InfoIcon } from "@/components/icons";
import { Card, cx } from "@/components/ui";
import { useI18n } from "@/i18n/I18nProvider";
import type {
  AiSummary,
  ParkingFacility,
  ProviderStatus,
  Section,
  SituationReport,
  SourceInfo,
} from "@/lib/types";

function collectSources(
  report: SituationReport | undefined,
  parking: Section<ParkingFacility[]> | undefined,
  summary: AiSummary | undefined,
): SourceInfo[] {
  if (!report) return [];
  const all: SourceInfo[] = [];
  const sections = [
    report.weather,
    report.traffic,
    report.incidents,
    report.cameras,
    ...(parking ? [parking] : []),
  ];
  for (const section of sections) {
    if (section.status === "ok") all.push(...section.sources);
  }
  if (summary) {
    all.push({
      providerId: `ai:${summary.provider.id}`,
      name: `${summary.provider.name} (${summary.provider.model})`,
      attribution: "",
      fetchedAt: summary.generatedAt,
    });
  }
  const unique = new Map<string, SourceInfo>();
  for (const s of all) if (!unique.has(s.providerId)) unique.set(s.providerId, s);
  return [...unique.values()];
}

export function SourcesPanel({
  report,
  parking,
  providers,
  summary,
}: {
  report: SituationReport | undefined;
  parking: Section<ParkingFacility[]> | undefined;
  providers: ProviderStatus[];
  summary: AiSummary | undefined;
}) {
  const { t, formatRelative } = useI18n();
  const sources = collectSources(report, parking, summary);
  return (
    <Card id="sources" title={t("sources.title")} icon={<InfoIcon />}>
      {sources.length > 0 ? (
        <ul className="mb-4 space-y-1.5 text-sm" data-testid="sources">
          {sources.map((source) => (
            <li key={source.providerId} className="flex flex-wrap items-baseline gap-x-2">
              {source.url ? (
                <a
                  href={source.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium underline-offset-2 hover:underline"
                >
                  {source.name}
                </a>
              ) : (
                <span className="font-medium">{source.name}</span>
              )}
              {source.attribution && source.attribution !== source.name ? (
                <span className="text-slate-600 dark:text-slate-400">{source.attribution}</span>
              ) : null}
              <span className="text-xs text-slate-500">
                {source.observedAt
                  ? t("sources.observed", { time: formatRelative(source.observedAt) })
                  : t("sources.fetched", { time: formatRelative(source.fetchedAt) })}
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      <details className="group text-sm">
        <summary className="cursor-pointer font-medium text-slate-700 select-none dark:text-slate-300">
          {t("sources.providers")}
        </summary>
        <ul className="mt-2 grid gap-1.5 sm:grid-cols-2" data-testid="providers">
          {providers.map((p) => (
            <li
              key={`${p.kind}:${p.id}`}
              className="flex items-start gap-2 rounded-lg bg-slate-50 px-2.5 py-1.5 dark:bg-slate-800/60"
            >
              <span
                aria-hidden="true"
                className={cx(
                  "mt-1.5 size-2 shrink-0 rounded-full",
                  p.active
                    ? "bg-emerald-500"
                    : p.enabled
                      ? "bg-sky-400"
                      : "bg-slate-300 dark:bg-slate-600",
                )}
              />
              <span className="min-w-0">
                <span className="block">
                  <span className="text-xs text-slate-500">{p.kind}</span> · {p.name}
                </span>
                <span className="block text-xs text-slate-500">
                  {p.enabled ? t("sources.enabled") : t("sources.disabled")}
                  {!p.enabled && p.requiredEnv.length > 0
                    ? ` · ${t("sources.requires", { env: p.requiredEnv.join(", ") })}`
                    : ""}
                </span>
              </span>
            </li>
          ))}
        </ul>
      </details>
      <p className="mt-3 text-xs text-slate-500">{t("sources.privacy")}</p>
    </Card>
  );
}
