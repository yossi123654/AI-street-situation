"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import { CamerasCard } from "@/components/CamerasCard";
import { Header } from "@/components/Header";
import { HomeDashboard } from "@/components/HomeDashboard";
import { IncidentsCard } from "@/components/IncidentsCard";
import { ParkingCard } from "@/components/ParkingCard";
import { PhotosCard } from "@/components/PhotosCard";
import { CodeIcon, PinIcon, RefreshIcon, RouteIcon } from "@/components/icons";
import { SearchBar } from "@/components/SearchBar";
import { SourcesPanel } from "@/components/SourcesPanel";
import { SummaryCard, type SummaryState } from "@/components/SummaryCard";
import { TrafficCard } from "@/components/TrafficCard";
import { TripSearch, type TripEndpoint } from "@/components/TripSearch";
import { TripDetails, TripOverviewCard } from "@/components/TripView";
import { usePhotos } from "@/components/usePhotos";
import { Notice, Skeleton, Spinner, cx } from "@/components/ui";
import { useTripData, type TripSelection } from "@/components/useTripData";
import { WeatherCard } from "@/components/WeatherCard";
import { I18nProvider, useI18n } from "@/i18n/I18nProvider";
import { ApiRequestError, apiGet } from "@/lib/apiClient";
import type {
  AiSummary,
  CameraView,
  Locale,
  MapConfig,
  ParkingFacility,
  Place,
  ProviderStatus,
  Section,
  SituationReport,
} from "@/lib/types";

const MapView = dynamic(() => import("@/components/MapView").then((m) => m.MapView), {
  ssr: false,
  loading: () => <Skeleton className="size-full rounded-none" />,
});

const NO_CAMERAS: CameraView[] = [];
const NO_PARKING: ParkingFacility[] = [];
const NONE: never[] = [];

type Mode = "place" | "trip";

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
  parkingRadiusM: number;
  photoRadiusM: number;
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

function parseEndpointParam(params: URLSearchParams, name: string): TripEndpoint | null {
  const match = params.get(name)?.match(/^(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)$/);
  if (!match) return null;
  const lat = Number(match[1]);
  const lon = Number(match[2]);
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  const label = params.get(`${name}Label`) ?? undefined;
  return { lat, lon, ...(label ? { label } : {}) };
}

function readTripFromUrl(): TripSelection | null {
  const params = new URLSearchParams(window.location.search);
  const from = parseEndpointParam(params, "from");
  const to = parseEndpointParam(params, "to");
  const depart = params.get("depart");
  // A shared link with a departure that has already passed means "now".
  const departAt =
    depart && Date.parse(depart) > Date.now() - 5 * 60_000
      ? new Date(depart).toISOString()
      : undefined;
  return from && to ? { from, to, ...(departAt ? { departAt } : {}) } : null;
}

function writeTripToUrl(trip: TripSelection) {
  const params = new URLSearchParams();
  params.set("from", `${trip.from.lat.toFixed(5)},${trip.from.lon.toFixed(5)}`);
  params.set("to", `${trip.to.lat.toFixed(5)},${trip.to.lon.toFixed(5)}`);
  if (trip.from.label) params.set("fromLabel", trip.from.label);
  if (trip.to.label) params.set("toLabel", trip.to.label);
  if (trip.departAt) params.set("depart", trip.departAt);
  window.history.replaceState(null, "", `?${params.toString()}`);
}

function AppInner({ map, providers, cameraRadiusM, parkingRadiusM, photoRadiusM }: Props) {
  const { t, locale, formatRelative } = useI18n();
  const [mode, setMode] = useState<Mode>("place");
  const [place, setPlace] = useState<SelectedPlace | null>(null);
  const [trip, setTrip] = useState<TripSelection | null>(null);
  const [homeArea, setHomeArea] = useState<{ lat: number; lon: number } | null>(null);
  const [selectedStopId, setSelectedStopId] = useState<string | null>(null);
  const [selectedCameraId, setSelectedCameraId] = useState<string | null>(null);
  const [selectedParkingId, setSelectedParkingId] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const resultsRef = useRef<HTMLDivElement>(null);
  const aiEnabled = providers.some((p) => p.kind === "ai" && p.enabled);

  // Restore a shared link: ?lat=..&lon=.. (place) or ?from=..&to=.. (trip).
  useEffect(() => {
    const tripFromUrl = readTripFromUrl();
    /* eslint-disable react-hooks/set-state-in-effect -- one-time sync from the URL on mount */
    if (tripFromUrl) {
      setTrip(tripFromUrl);
      setMode("trip");
      return;
    }
    const fromUrl = readPlaceFromUrl();
    if (fromUrl) setPlace(fromUrl);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  const planTrip = useCallback((from: TripEndpoint, to: TripEndpoint, departAt?: string) => {
    const next = { from, to, ...(departAt ? { departAt } : {}) };
    setTrip(next);
    setSelectedStopId(null);
    setSelectedParkingId(null);
    writeTripToUrl(next);
    if (window.matchMedia("(max-width: 1023px)").matches) {
      resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, []);

  const switchMode = (next: Mode) => {
    setMode(next);
    if (next === "trip" && trip) writeTripToUrl(trip);
    else if (next === "place" && place) writePlaceToUrl(place);
    else window.history.replaceState(null, "", window.location.pathname);
  };

  const selectPlace = useCallback(
    (next: SelectedPlace, options: { reverseGeocode?: boolean } = {}) => {
      setMode("place");
      setPlace(next);
      setSelectedCameraId(null);
      setSelectedParkingId(null);
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

  const lat = mode === "place" ? place?.lat : undefined;
  const lon = mode === "place" ? place?.lon : undefined;
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

  // Parking is fetched separately so a slow Overpass response never delays the report.
  const parkingKey = lat === undefined || lon === undefined ? null : `${lat},${lon},${reloadToken}`;
  const [parkingResult, setParkingResult] = useState<{
    key: string;
    section: Section<ParkingFacility[]>;
  } | null>(null);

  useEffect(() => {
    if (!parkingKey || lat === undefined || lon === undefined) return;
    const controller = new AbortController();
    apiGet<Section<ParkingFacility[]>>(`/api/parking?lat=${lat}&lon=${lon}`, {
      signal: controller.signal,
    })
      .then((section) => setParkingResult({ key: parkingKey, section }))
      .catch(() => {
        if (!controller.signal.aborted) {
          setParkingResult({
            key: parkingKey,
            section: { status: "unavailable", reason: "error" },
          });
        }
      });
    return () => controller.abort();
  }, [parkingKey, lat, lon]);

  const parkingLoading = Boolean(parkingKey) && parkingResult?.key !== parkingKey;
  const parking = parkingResult?.key === parkingKey ? parkingResult.section : undefined;
  const parkingFacilities = parking?.status === "ok" ? parking.data : NO_PARKING;

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

  // Trip mode.
  const tripData = useTripData(mode === "trip" ? trip : null, locale, aiEnabled, reloadToken);
  const tripReport = tripData.report?.status === "ok" ? tripData.report.data : undefined;
  const tripRoute = tripReport?.route.status === "ok" ? tripReport.route.data : null;
  const tripStops = tripData.stops?.status === "ok" ? tripData.stops.data : NONE;
  const tripParking =
    tripReport?.destinationParking.status === "ok"
      ? tripReport.destinationParking.data
      : NO_PARKING;
  // Photos of the selected place, or of the trip's destination.
  const photoPoint = mode === "trip" ? (trip?.to ?? null) : (place ?? null);
  const photos = usePhotos(
    photoPoint ? { lat: photoPoint.lat, lon: photoPoint.lon } : null,
    reloadToken,
  );

  const tripCameras = tripReport?.cameras?.status === "ok" ? tripReport.cameras.data : NO_CAMERAS;
  const mapTrip =
    mode === "trip" && trip
      ? {
          from: trip.from,
          to: trip.to,
          route: tripRoute,
          weather: tripReport?.weatherAlong.status === "ok" ? tripReport.weatherAlong.data : NONE,
          stops: tripStops,
          selectedStopId,
        }
      : null;

  return (
    <div className="flex min-h-dvh flex-col">
      <Header />

      <div className="border-b border-slate-200 bg-white/70 dark:border-slate-800 dark:bg-slate-900/60">
        <div className="mx-auto max-w-7xl space-y-3 px-4 py-4">
          <div
            role="tablist"
            aria-label={t("mode.label")}
            className="inline-flex rounded-xl bg-slate-100 p-1 text-sm dark:bg-slate-800"
          >
            {(["place", "trip"] as const).map((value) => (
              <button
                key={value}
                role="tab"
                type="button"
                aria-selected={mode === value}
                onClick={() => switchMode(value)}
                data-testid={`mode-${value}`}
                className={cx(
                  "inline-flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 font-medium transition-colors",
                  mode === value
                    ? "bg-white text-slate-900 shadow-sm dark:bg-slate-950 dark:text-slate-100"
                    : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200",
                )}
              >
                {value === "place" ? <PinIcon /> : <RouteIcon />}
                {t(`mode.${value}`)}
              </button>
            ))}
          </div>
          {mode === "place" ? (
            <SearchBar
              onSelect={(p) => selectPlace({ lat: p.lat, lon: p.lon, label: p.label })}
              onLocate={(p) => selectPlace(p, { reverseGeocode: true })}
            />
          ) : (
            <TripSearch
              key={trip ? `${trip.from.lat},${trip.to.lat},${trip.departAt ?? "now"}` : "empty"}
              initial={trip ?? undefined}
              onPlan={planTrip}
            />
          )}
        </div>
      </div>

      <main className="mx-auto grid w-full max-w-7xl flex-1 gap-4 px-4 py-4 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <div className="lg:sticky lg:top-4 lg:h-[calc(100dvh-2rem)]">
          <div className="relative h-72 overflow-hidden rounded-2xl border border-slate-200 shadow-sm sm:h-96 lg:h-full dark:border-slate-800">
            <MapView
              config={map}
              place={place}
              cameras={mode === "place" ? cameras : tripCameras}
              parking={mode === "place" ? parkingFacilities : tripParking}
              trip={mapTrip}
              homeArea={homeArea}
              selectedCameraId={selectedCameraId}
              selectedParkingId={selectedParkingId}
              onPick={(point) => selectPlace(point, { reverseGeocode: true })}
              onSelectCamera={setSelectedCameraId}
              onSelectParking={setSelectedParkingId}
            />
            {mode === "place" ? (
              <p className="pointer-events-none absolute inset-x-2 top-2 z-[1000] mx-auto w-fit rounded-full bg-white/90 px-3 py-1 text-xs text-slate-600 shadow dark:bg-slate-900/90 dark:text-slate-300">
                {t("map.hint")}
              </p>
            ) : null}
          </div>
        </div>

        <div
          ref={resultsRef}
          className="min-w-0 scroll-mt-4 space-y-4"
          aria-live="polite"
          aria-busy={report.status === "loading" || tripData.report?.status === "loading"}
        >
          {mode === "trip" ? (
            !trip ? (
              <EmptyState trip />
            ) : (
              <>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <RouteIcon className="text-xl text-brand-600" />
                  <h2
                    className="min-w-0 flex-1 text-lg leading-snug font-semibold"
                    data-testid="trip-label"
                  >
                    {t("trip.title", {
                      from:
                        trip.from.label ??
                        `${trip.from.lat.toFixed(4)}, ${trip.from.lon.toFixed(4)}`,
                      to: trip.to.label ?? `${trip.to.lat.toFixed(4)}, ${trip.to.lon.toFixed(4)}`,
                    })}
                  </h2>
                  {tripData.report?.status === "loading" ? (
                    <span className="flex items-center gap-2 text-sm text-slate-500">
                      <Spinner /> {t("trip.loading")}
                    </span>
                  ) : tripReport ? (
                    <span className="flex items-center gap-2 text-xs text-slate-500">
                      {t("report.updated", { time: formatRelative(tripReport.generatedAt) })}
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
                {tripData.report?.status === "error" ? (
                  <Notice tone="error">
                    <p>
                      {tripData.report.code === "bad_request"
                        ? t("trip.tooFarOrInvalid")
                        : t("trip.error")}
                    </p>
                    <button
                      type="button"
                      className="mt-2 font-medium underline"
                      onClick={() => setReloadToken((n) => n + 1)}
                    >
                      {t("report.retry")}
                    </button>
                  </Notice>
                ) : null}
                <TripOverviewCard
                  report={tripReport}
                  summary={tripData.summary}
                  parkingRadiusM={parkingRadiusM}
                />
                <TripDetails
                  report={tripReport}
                  stops={tripData.stops}
                  stopsLoading={tripData.stopsLoading}
                  selectedStopId={selectedStopId}
                  onSelectStop={setSelectedStopId}
                  parkingRadiusM={parkingRadiusM}
                  selectedParkingId={selectedParkingId}
                  onSelectParking={setSelectedParkingId}
                  selectedCameraId={selectedCameraId}
                  onSelectCamera={setSelectedCameraId}
                  aiEnabled={aiEnabled}
                />
                <PhotosCard
                  section={photos.section}
                  loading={photos.loading}
                  radiusM={photoRadiusM}
                  title={t("photos.destinationTitle")}
                />
              </>
            )
          ) : !place ? (
            <HomeDashboard
              defaultCenter={map.defaultCenter}
              providers={providers}
              onOpenPlace={(point) => selectPlace(point, { reverseGeocode: !point.label })}
              onPlanTrip={() => switchMode("trip")}
              onAreaChange={setHomeArea}
            />
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

              <SummaryCard
                report={shown}
                summary={summary}
                parking={parking}
                parkingRadiusM={parkingRadiusM}
              />

              <div className="grid gap-4 md:grid-cols-2">
                <WeatherCard section={shown?.weather} />
                <TrafficCard section={shown?.traffic} />
              </div>
              <ParkingCard
                section={parking}
                loading={parkingLoading}
                radiusM={parkingRadiusM}
                selectedId={selectedParkingId}
                onSelect={setSelectedParkingId}
              />
              <IncidentsCard section={shown?.incidents} />
              <CamerasCard
                section={shown?.cameras}
                radiusM={cameraRadiusM}
                selectedId={selectedCameraId}
                onSelect={setSelectedCameraId}
                aiEnabled={aiEnabled}
              />
              <PhotosCard
                section={photos.section}
                loading={photos.loading}
                radiusM={photoRadiusM}
              />
            </>
          )}
          <SourcesPanel
            sections={
              mode === "trip"
                ? [
                    tripReport?.route,
                    tripReport?.weatherAlong,
                    tripReport?.trafficAlong,
                    tripReport?.incidents,
                    tripData.stops,
                    tripReport?.destinationParking,
                    tripReport?.cameras,
                    photos.section,
                  ]
                : [
                    shown?.weather,
                    shown?.traffic,
                    shown?.incidents,
                    shown?.cameras,
                    parking,
                    photos.section,
                  ]
            }
            providers={providers}
            summary={
              mode === "trip"
                ? tripData.summary.status === "ok"
                  ? tripData.summary.data
                  : undefined
                : summary.status === "ok"
                  ? summary.data
                  : undefined
            }
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

function EmptyState({ trip = false }: { trip?: boolean }) {
  const { t } = useI18n();
  return (
    <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center dark:border-slate-700 dark:bg-slate-900">
      {trip ? (
        <RouteIcon className="mx-auto mb-3 text-4xl text-brand-500" />
      ) : (
        <PinIcon className="mx-auto mb-3 text-4xl text-brand-500" />
      )}
      <h2 className="mb-2 text-lg font-semibold">
        {trip ? t("empty.tripTitle") : t("empty.title")}
      </h2>
      <p className="mx-auto max-w-prose text-sm text-slate-600 dark:text-slate-400">
        {trip ? t("empty.tripBody") : t("empty.body")}
      </p>
    </div>
  );
}
