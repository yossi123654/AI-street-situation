"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import { CamerasCard } from "@/components/CamerasCard";
import { Header } from "@/components/Header";
import { IncidentsCard } from "@/components/IncidentsCard";
import { CodeIcon, PinIcon, RefreshIcon } from "@/components/icons";
import { SearchBar } from "@/components/SearchBar";
import { SourcesPanel } from "@/components/SourcesPanel";
import { SummaryCard, type SummaryState } from "@/components/SummaryCard";
import { TrafficCard } from "@/components/TrafficCard";
import { Notice, Skeleton, Spinner } from "@/components/ui";
import { WeatherCard } from "@/components/WeatherCard";
import { I18nProvider, useI18n } from "@/i18n/I18nProvider";
import { ApiRequestError, apiGet } from "@/lib/apiClient";
import type {
  AiSummary,
  CameraView,
  Locale,
  MapConfig,
  Place,
  ProviderStatus,
  SituationReport,
} from "@/lib/types";

const MapView = dynamic(() => import("@/components/MapView").then((m) => m.MapView), {
  ssr: false,
  loading: () => <Skeleton className="size-full rounded-none" />,
});

const NO_CAMERAS: CameraView[] = [];

export interface SelectedPlace {
  lat: number;
  lon: number;
  label?: string;
}

type ReportState =
  | { status: "idle" }
  | { status: "loading"; previous?: SituationReport }
  | { status: "ok"; data: SituationReport }
  | { status: "error" };

interface Props {
  locale: Locale;
  map: MapConfig;
  providers: ProviderStatus[];
  cameraRadiusM: number;
}

export function StreetSituationApp(props: Props) {
  return (
    <I18nProvider locale={props.locale}>
      <AppInner {...props} />
    </I18nProvider>
  );
}

function readPlaceFromUrl(): SelectedPlace | null {
  const params = new URLSearchParams(window.location.search);
  const lat = Number(params.get("lat"));
  const lon = Number(params.get("lon"));
  if (!params.has("lat") || !Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  const label = params.get("label") ?? undefined;
  return { lat, lon, ...(label ? { label } : {}) };
}

function writePlaceToUrl(place: SelectedPlace) {
  const params = new URLSearchParams();
  params.set("lat", place.lat.toFixed(5));
  params.set("lon", place.lon.toFixed(5));
  if (place.label) params.set("label", place.label);
  window.history.replaceState(null, "", `?${params.toString()}`);
}

function AppInner({ map, providers, cameraRadiusM }: Props) {
  const { t, locale, formatRelative } = useI18n();
  const [place, setPlace] = useState<SelectedPlace | null>(null);
  const [selectedCameraId, setSelectedCameraId] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const resultsRef = useRef<HTMLDivElement>(null);
  const aiEnabled = providers.some((p) => p.kind === "ai" && p.enabled);

  // Restore a shared link (?lat=..&lon=..&label=..).
  useEffect(() => {
    const fromUrl = readPlaceFromUrl();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time sync from the URL on mount
    if (fromUrl) setPlace(fromUrl);
  }, []);

  const selectPlace = useCallback(
    (next: SelectedPlace, options: { reverseGeocode?: boolean } = {}) => {
      setPlace(next);
      setSelectedCameraId(null);
      writePlaceToUrl(next);
      if (options.reverseGeocode) {
        apiGet<{ place: Place | null }>(
          `/api/reverse?lat=${next.lat}&lon=${next.lon}&lang=${locale}`,
        )
          .then(({ place: found }) => {
            if (!found) return;
            setPlace((current) => {
              if (!current || current.lat !== next.lat || current.lon !== next.lon) return current;
              const labelled = { ...current, label: found.label };
              writePlaceToUrl(labelled);
              return labelled;
            });
          })
          .catch(() => undefined);
      }
      if (window.matchMedia("(max-width: 1023px)").matches) {
        resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    },
    [locale],
  );

  const lat = place?.lat;
  const lon = place?.lon;
  const label = place?.label;

  // Each request is identified by a key; loading state is derived by comparing
  // the latest result's key with the current one (no setState inside effects).
  const reportKey =
    lat === undefined || lon === undefined ? null : `${lat},${lon},${locale},${reloadToken}`;
  const [reportResult, setReportResult] = useState<
    { key: string; data: SituationReport } | { key: string; error: true } | null
  >(null);

  useEffect(() => {
    if (!reportKey || lat === undefined || lon === undefined) return;
    const controller = new AbortController();
    const params = new URLSearchParams({ lat: String(lat), lon: String(lon), lang: locale });
    apiGet<SituationReport>(`/api/situation?${params}`, { signal: controller.signal })
      .then((data) => setReportResult({ key: reportKey, data }))
      .catch(() => {
        if (!controller.signal.aborted) setReportResult({ key: reportKey, error: true });
      });
    return () => controller.abort();
  }, [reportKey, lat, lon, locale]);

  const lastReport = reportResult && "data" in reportResult ? reportResult.data : undefined;
  const report: ReportState = !reportKey
    ? { status: "idle" }
    : reportResult?.key !== reportKey
      ? { status: "loading", ...(lastReport ? { previous: lastReport } : {}) }
      : "error" in reportResult
        ? { status: "error" }
        : { status: "ok", data: reportResult.data };

  // Ask for the AI summary once the report is in (the server reuses its cached report).
  const summaryKey =
    report.status === "ok" && aiEnabled ? `${report.data.generatedAt},${locale}` : null;
  const [summaryResult, setSummaryResult] = useState<{ key: string; state: SummaryState } | null>(
    null,
  );

  useEffect(() => {
    if (!summaryKey || lat === undefined || lon === undefined) return;
    const controller = new AbortController();
    const params = new URLSearchParams({ lat: String(lat), lon: String(lon), lang: locale });
    if (label) params.set("label", label);
    apiGet<AiSummary>(`/api/summary?${params}`, { signal: controller.signal })
      .then((data) => setSummaryResult({ key: summaryKey, state: { status: "ok", data } }))
      .catch((error) => {
        if (controller.signal.aborted) return;
        const state: SummaryState =
          error instanceof ApiRequestError && error.code === "not_configured"
            ? { status: "not_configured" }
            : { status: "error" };
        setSummaryResult({ key: summaryKey, state });
      });
    return () => controller.abort();
    // The label can arrive later (reverse geocoding); it must not trigger a new summary.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [summaryKey]);

  const summary: SummaryState =
    report.status !== "ok"
      ? { status: "idle" }
      : !aiEnabled
        ? { status: "not_configured" }
        : summaryResult?.key === summaryKey
          ? summaryResult.state
          : { status: "loading" };

  const shown =
    report.status === "ok"
      ? report.data
      : report.status === "loading"
        ? report.previous
        : undefined;
  const cameras = shown?.cameras.status === "ok" ? shown.cameras.data : NO_CAMERAS;

  return (
    <div className="flex min-h-dvh flex-col">
      <Header />

      <div className="border-b border-slate-200 bg-white/70 dark:border-slate-800 dark:bg-slate-900/60">
        <div className="mx-auto max-w-7xl px-4 py-5">
          <SearchBar
            onSelect={(p) => selectPlace({ lat: p.lat, lon: p.lon, label: p.label })}
            onLocate={(p) => selectPlace(p, { reverseGeocode: true })}
          />
        </div>
      </div>

      <main className="mx-auto grid w-full max-w-7xl flex-1 gap-4 px-4 py-4 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <div className="lg:sticky lg:top-4 lg:h-[calc(100dvh-2rem)]">
          <div className="relative h-72 overflow-hidden rounded-2xl border border-slate-200 shadow-sm sm:h-96 lg:h-full dark:border-slate-800">
            <MapView
              config={map}
              place={place}
              cameras={cameras}
              selectedCameraId={selectedCameraId}
              onPick={(point) => selectPlace(point, { reverseGeocode: true })}
              onSelectCamera={setSelectedCameraId}
            />
            <p className="pointer-events-none absolute inset-x-2 top-2 z-[1000] mx-auto w-fit rounded-full bg-white/90 px-3 py-1 text-xs text-slate-600 shadow dark:bg-slate-900/90 dark:text-slate-300">
              {t("map.hint")}
            </p>
          </div>
        </div>

        <div
          ref={resultsRef}
          className="min-w-0 scroll-mt-4 space-y-4"
          aria-live="polite"
          aria-busy={report.status === "loading"}
        >
          {!place ? (
            <EmptyState />
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <PinIcon className="text-xl text-brand-600" />
                <h2
                  className="min-w-0 flex-1 text-lg font-semibold leading-snug"
                  data-testid="place-label"
                >
                  {place.label ?? `${place.lat.toFixed(5)}, ${place.lon.toFixed(5)}`}
                </h2>
                {report.status === "loading" ? (
                  <span className="flex items-center gap-2 text-sm text-slate-500">
                    <Spinner /> {t("report.loading")}
                  </span>
                ) : report.status === "ok" ? (
                  <span className="flex items-center gap-2 text-xs text-slate-500">
                    {t("report.updated", { time: formatRelative(report.data.generatedAt) })}
                    <button
                      type="button"
                      onClick={() => setReloadToken((n) => n + 1)}
                      className="inline-flex items-center gap-1 rounded-lg px-2 py-1 font-medium text-brand-700 hover:bg-brand-50 dark:text-brand-500 dark:hover:bg-slate-800"
                    >
                      <RefreshIcon /> {t("report.refresh")}
                    </button>
                  </span>
                ) : null}
              </div>

              {report.status === "error" ? (
                <Notice tone="error">
                  <p>{t("report.error")}</p>
                  <button
                    type="button"
                    className="mt-2 font-medium underline"
                    onClick={() => setReloadToken((n) => n + 1)}
                  >
                    {t("report.retry")}
                  </button>
                </Notice>
              ) : null}

              <SummaryCard report={shown} summary={summary} cameraRadiusM={cameraRadiusM} />

              <div className="grid gap-4 md:grid-cols-2">
                <WeatherCard section={shown?.weather} />
                <TrafficCard section={shown?.traffic} />
              </div>
              <IncidentsCard section={shown?.incidents} />
              <CamerasCard
                section={shown?.cameras}
                radiusM={cameraRadiusM}
                selectedId={selectedCameraId}
                onSelect={setSelectedCameraId}
                aiEnabled={aiEnabled}
              />
            </>
          )}
          <SourcesPanel
            report={shown}
            providers={providers}
            summary={summary.status === "ok" ? summary.data : undefined}
          />
        </div>
      </main>

      <footer className="border-t border-slate-200 py-4 text-center text-xs text-slate-500 dark:border-slate-800">
        <a
          className="inline-flex items-center gap-1 hover:text-brand-700"
          href="https://github.com/yossi123654/ai-street-situation"
          target="_blank"
          rel="noopener noreferrer"
        >
          <CodeIcon /> AI Street Situation · MIT License
        </a>
      </footer>
    </div>
  );
}

function EmptyState() {
  const { t } = useI18n();
  return (
    <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center dark:border-slate-700 dark:bg-slate-900">
      <PinIcon className="mx-auto mb-3 text-4xl text-brand-500" />
      <h2 className="mb-2 text-lg font-semibold">{t("empty.title")}</h2>
      <p className="mx-auto max-w-prose text-sm text-slate-600 dark:text-slate-400">
        {t("empty.body")}
      </p>
    </div>
  );
}
