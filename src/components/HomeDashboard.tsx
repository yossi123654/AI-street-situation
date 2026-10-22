"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import {
  CameraIcon,
  CodeIcon,
  LocateIcon,
  PhotoIcon,
  RouteIcon,
  SparkIcon,
} from "@/components/icons";
import { Skeleton, Spinner, cx } from "@/components/ui";
import { usePhotos } from "@/components/usePhotos";
import { useI18n } from "@/i18n/I18nProvider";
import { apiGet } from "@/lib/apiClient";
import { areaForTimeZone, browserTimeZone } from "@/lib/timezoneAreas";
import type { AreaSummary, CameraView, LatLon, Place, ProviderStatus } from "@/lib/types";
import { describeWeatherCode } from "@/lib/weatherCodes";

type AreaSource = "precise" | "timezone" | "default";

interface HomeArea extends LatLon {
  source: AreaSource;
  label?: string;
}

const noopSubscribe = () => () => undefined;
/** The home point is rounded to ~1 km, so photos are searched a little wider. */
const HOME_PHOTO_RADIUS_M = 1000;
/** Rounds to ~1 km: the home page never sends a more precise location. */
const round2 = (value: number) => Math.round(value * 100) / 100;

/**
 * Where "your area" is: the precise location when the visitor has already
 * allowed it (or asks for it), otherwise a city picked from the browser's
 * time zone, otherwise the map's default centre. Never prompts on its own.
 */
function useHomeArea(defaultCenter: [number, number]) {
  const { locale } = useI18n();
  const timeZone = useSyncExternalStore(noopSubscribe, browserTimeZone, () => undefined);
  const [precise, setPrecise] = useState<LatLon | null>(null);
  const [preciseLabel, setPreciseLabel] = useState<string | undefined>(undefined);
  const [locating, setLocating] = useState(false);
  const [geoError, setGeoError] = useState(false);

  const locate = () => {
    if (!("geolocation" in navigator)) {
      setGeoError(true);
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocating(false);
        setGeoError(false);
        setPrecise({
          lat: round2(position.coords.latitude),
          lon: round2(position.coords.longitude),
        });
      },
      () => {
        setLocating(false);
        setGeoError(true);
      },
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 10 * 60_000 },
    );
  };

  // Use the precise location only when permission was already granted earlier.
  useEffect(() => {
    let cancelled = false;
    navigator.permissions
      ?.query({ name: "geolocation" as PermissionName })
      .then((status) => {
        if (cancelled || status.state !== "granted") return;
        navigator.geolocation.getCurrentPosition(
          (position) => {
            if (cancelled) return;
            setPrecise({
              lat: round2(position.coords.latitude),
              lon: round2(position.coords.longitude),
            });
          },
          () => undefined,
          { enableHighAccuracy: false, timeout: 10_000, maximumAge: 10 * 60_000 },
        );
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  // A readable name for the precise location (rounded to ~1 km).
  useEffect(() => {
    if (!precise) return;
    const controller = new AbortController();
    apiGet<{ place: Place | null }>(
      `/api/reverse?lat=${precise.lat}&lon=${precise.lon}&lang=${locale}`,
      { signal: controller.signal },
    )
      .then(({ place }) => setPreciseLabel(place?.label))
      .catch(() => undefined);
    return () => controller.abort();
  }, [precise, locale]);

  const zoneArea = areaForTimeZone(timeZone);
  const area: HomeArea = precise
    ? { ...precise, source: "precise", label: preciseLabel }
    : zoneArea
      ? {
          lat: zoneArea.lat,
          lon: zoneArea.lon,
          source: "timezone",
          label: `${zoneArea.city[locale]}, ${zoneArea.region[locale]}`,
        }
      : { lat: defaultCenter[0], lon: defaultCenter[1], source: "default" };
  return { area, locate, locating, geoError };
}

function useAreaSummary(point: LatLon) {
  const key = `${point.lat},${point.lon}`;
  const [result, setResult] = useState<{ key: string; data: AreaSummary | null } | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    apiGet<AreaSummary>(`/api/area?lat=${point.lat}&lon=${point.lon}`, {
      signal: controller.signal,
    })
      .then((data) => setResult({ key, data }))
      .catch(() => {
        if (!controller.signal.aborted) setResult({ key, data: null });
      });
    return () => controller.abort();
  }, [key, point.lat, point.lon]);
  return result?.key === key
    ? { loading: false, data: result.data }
    : { loading: true, data: null };
}

function Tile({
  className,
  children,
  testId,
}: {
  className?: string;
  children: React.ReactNode;
  testId?: string;
}) {
  return (
    <section
      className={cx(
        "rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900",
        className,
      )}
      data-testid={testId}
    >
      {children}
    </section>
  );
}

export function HomeDashboard({
  defaultCenter,
  providers,
  onOpenPlace,
  onPlanTrip,
  onAreaChange,
}: {
  defaultCenter: [number, number];
  providers: ProviderStatus[];
  onOpenPlace: (point: LatLon & { label?: string }) => void;
  onPlanTrip: () => void;
  /** Tells the map where "your area" is. */
  onAreaChange?: (point: LatLon) => void;
}) {
  const { t, locale, formatDistance, formatNumber, formatRelative } = useI18n();
  const { area, locate, locating, geoError } = useHomeArea(defaultCenter);
  const point = { lat: round2(area.lat), lon: round2(area.lon) };
  const summary = useAreaSummary(point);
  useEffect(() => {
    onAreaChange?.({ lat: point.lat, lon: point.lon });
  }, [onAreaChange, point.lat, point.lon]);
  const photos = usePhotos(point, 0, HOME_PHOTO_RADIUS_M);
  const data = summary.data;
  const weather = data?.weather.status === "ok" ? data.weather.data : null;
  const today = data?.today.status === "ok" ? data.today.data : null;
  const condition = weather ? describeWeatherCode(weather.weatherCode, weather.isDay) : null;
  const night = weather?.isDay === false;
  const photoList = photos.section?.status === "ok" ? photos.section.data : [];
  const activeSources = providers.filter((p) => p.active);
  const temp = (value: number | null | undefined) =>
    value === null || value === undefined ? "–" : `${formatNumber(Math.round(value))}°`;

  return (
    <div className="space-y-4" data-testid="home">
      {/* Where "your area" is, and how we know. */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-xl font-semibold">{t("home.title")}</h2>
          <p className="mt-0.5 text-sm text-slate-600 dark:text-slate-400" data-testid="home-area">
            {area.label ?? t("home.defaultArea")}
            {" · "}
            <span className="text-slate-500">{t(`home.source.${area.source}`)}</span>
          </p>
          {geoError ? (
            <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">{t("home.geoError")}</p>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          {area.source !== "precise" ? (
            <button
              type="button"
              onClick={locate}
              disabled={locating}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-slate-800"
              data-testid="home-locate"
            >
              {locating ? <Spinner /> : <LocateIcon />} {t("home.usePrecise")}
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => onOpenPlace({ ...point, label: area.label })}
            className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700"
            data-testid="home-open"
          >
            <SparkIcon /> {t("home.openReport")}
          </button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {/* Weather now and today. */}
        <Tile
          testId="home-weather"
          className={cx(
            "sm:col-span-2",
            night
              ? "border-indigo-900 bg-gradient-to-br from-slate-900 to-indigo-950 text-white dark:border-indigo-900"
              : "border-sky-100 bg-gradient-to-br from-sky-50 to-white dark:from-slate-900 dark:to-slate-900",
          )}
        >
          {summary.loading ? (
            <div className="space-y-3">
              <Skeleton className="h-12 w-40" />
              <Skeleton className="h-4 w-64" />
            </div>
          ) : !weather || !condition ? (
            <p className="text-sm text-slate-500">{t("home.weatherUnavailable")}</p>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <span className="text-6xl leading-none" aria-hidden="true">
                  {condition.emoji}
                </span>
                <div>
                  <p className="text-5xl font-semibold tabular-nums" data-testid="home-temp">
                    {temp(weather.temperatureC)}
                  </p>
                  <p
                    className={cx(
                      "text-sm",
                      night ? "text-slate-300" : "text-slate-600 dark:text-slate-400",
                    )}
                  >
                    {t(`wmo.${condition.key}`)}
                    {weather.apparentTemperatureC !== null
                      ? ` · ${t("weather.feelsLike", { value: temp(weather.apparentTemperatureC) })}`
                      : ""}
                  </p>
                </div>
              </div>
              {today ? (
                <dl
                  className={cx(
                    "grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-4",
                    night ? "text-slate-200" : "text-slate-700 dark:text-slate-300",
                  )}
                  data-testid="home-today"
                >
                  <div>
                    <dt className="text-xs opacity-70">{t("home.highLow")}</dt>
                    <dd className="font-medium tabular-nums">
                      {temp(today.temperatureMaxC)} / {temp(today.temperatureMinC)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs opacity-70">{t("home.rainChance")}</dt>
                    <dd className="font-medium tabular-nums">
                      {today.precipitationProbabilityPct === null
                        ? "–"
                        : `${formatNumber(today.precipitationProbabilityPct)}%`}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs opacity-70">{t("home.uv")}</dt>
                    <dd className="font-medium tabular-nums">
                      {today.uvIndexMax === null
                        ? "–"
                        : formatNumber(today.uvIndexMax, { maximumFractionDigits: 0 })}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs opacity-70">{t("home.sunset")}</dt>
                    {/* The place's local time, as reported for that place. */}
                    <dd className="font-medium tabular-nums" dir="ltr">
                      {today.sunset ? today.sunset.slice(11, 16) : "–"}
                    </dd>
                  </div>
                </dl>
              ) : null}
            </div>
          )}
          {weather?.source.observedAt ? (
            <p className={cx("mt-3 text-xs", night ? "text-slate-400" : "text-slate-500")}>
              {t("home.weatherSource", { time: formatRelative(weather.source.observedAt) })}
            </p>
          ) : null}
        </Tile>

        {/* Cameras in the area. */}
        <Tile testId="home-cameras">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-600 dark:text-slate-300">
            <CameraIcon className="text-brand-600" /> {t("home.camerasTitle")}
          </h3>
          {summary.loading ? (
            <Skeleton className="mt-3 h-24 w-full" />
          ) : !data ? (
            <p className="mt-3 text-sm text-slate-500">{t("home.unavailable")}</p>
          ) : (
            <>
              <p className="mt-2">
                <span
                  className="text-4xl font-semibold tabular-nums"
                  data-testid="home-camera-count"
                >
                  {formatNumber(data.cameras.count)}
                </span>{" "}
                <span className="text-sm text-slate-600 dark:text-slate-400">
                  {t("home.camerasWithin", { radius: formatDistance(data.cameras.radiusM) })}
                </span>
              </p>
              {data.cameras.count > 0 ? (
                <p className="text-xs text-slate-500">
                  {t("home.camerasLive", { count: formatNumber(data.cameras.embeddableCount) })}
                </p>
              ) : null}
              {data.cameras.preview.length > 0 ? (
                <CameraPreview
                  key={data.cameras.preview.map((c) => c.id).join(",")}
                  cameras={data.cameras.preview}
                  onOpen={(camera) =>
                    onOpenPlace({ lat: camera.lat, lon: camera.lon, label: camera.name })
                  }
                />
              ) : (
                <p className="mt-3 text-sm text-slate-600 dark:text-slate-400">
                  {t("home.camerasNone")}{" "}
                  <a
                    href="https://github.com/yossi123654/ai-street-situation/blob/main/docs/camera-permission-request.md"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-medium text-brand-700 underline dark:text-brand-500"
                  >
                    {t("home.camerasHelp")}
                  </a>
                </p>
              )}
            </>
          )}
        </Tile>

        {/* Published photos of the area. */}
        <Tile testId="home-photos">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-600 dark:text-slate-300">
            <PhotoIcon className="text-brand-600" /> {t("home.photosTitle")}
          </h3>
          {photos.loading ? (
            <Skeleton className="mt-3 h-24 w-full" />
          ) : photoList.length === 0 ? (
            <p className="mt-3 text-sm text-slate-600 dark:text-slate-400">
              {t("home.photosNone")}{" "}
              <a
                href="https://panoramax.fr/"
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-brand-700 underline dark:text-brand-500"
              >
                {t("photos.contribute")}
              </a>
            </p>
          ) : (
            <button
              type="button"
              onClick={() => onOpenPlace({ ...point, label: area.label })}
              className="mt-2 block w-full text-start"
            >
              <span className="text-4xl font-semibold tabular-nums">
                {formatNumber(photoList.length)}
              </span>{" "}
              <span className="text-sm text-slate-600 dark:text-slate-400">
                {t("home.photosNear")}
              </span>
              <span className="mt-2 grid grid-cols-4 gap-1.5">
                {photoList.slice(0, 4).map((photo) => (
                  // eslint-disable-next-line @next/next/no-img-element -- proxied third-party photo
                  <img
                    key={photo.id}
                    src={`/api/photos/${photo.id}/image?size=thumb`}
                    alt=""
                    loading="lazy"
                    referrerPolicy="no-referrer"
                    className="aspect-square w-full rounded-lg bg-slate-100 object-cover dark:bg-slate-800"
                  />
                ))}
              </span>
            </button>
          )}
        </Tile>

        {/* Plan a trip. */}
        <Tile testId="home-trip" className="flex flex-col justify-between gap-3">
          <div>
            <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-600 dark:text-slate-300">
              <RouteIcon className="text-brand-600" /> {t("home.tripTitle")}
            </h3>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">{t("home.tripBody")}</p>
          </div>
          <button
            type="button"
            onClick={onPlanTrip}
            className="inline-flex w-fit items-center gap-1.5 rounded-lg border border-brand-500 px-3 py-1.5 text-sm font-medium text-brand-700 hover:bg-brand-50 dark:text-brand-500 dark:hover:bg-slate-800"
            data-testid="home-plan-trip"
          >
            <RouteIcon /> {t("home.tripAction")}
          </button>
        </Tile>

        {/* Open data, open source. */}
        <Tile testId="home-sources">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-600 dark:text-slate-300">
            <CodeIcon className="text-brand-600" /> {t("home.openTitle")}
          </h3>
          <p className="mt-2">
            <span className="text-4xl font-semibold tabular-nums">
              {formatNumber(activeSources.length)}
            </span>{" "}
            <span className="text-sm text-slate-600 dark:text-slate-400">
              {t("home.sourcesActive")}
            </span>
          </p>
          <p className="mt-1 text-xs text-slate-500">{t("home.privacy")}</p>
          <ul className="mt-2 flex flex-wrap gap-1.5" lang={locale === "he" ? "en" : undefined}>
            {activeSources.slice(0, 8).map((source) => (
              <li
                key={`${source.kind}:${source.id}`}
                className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300"
              >
                {source.name}
              </li>
            ))}
          </ul>
        </Tile>
      </div>
    </div>
  );
}

/** The nearest camera with a working image; skips to the next one when an image fails. */
function CameraPreview({
  cameras,
  onOpen,
}: {
  cameras: CameraView[];
  onOpen: (camera: CameraView) => void;
}) {
  const { t, formatDistance } = useI18n();
  const [failedIds, setFailedIds] = useState<string[]>([]);
  const isImage = (c: CameraView) => c.display === "embed" && c.mediaType === "image";
  const camera =
    cameras.find((c) => isImage(c) && !failedIds.includes(c.id)) ??
    cameras.find((c) => !isImage(c)) ??
    cameras[0]!;
  const showImage = isImage(camera) && !failedIds.includes(camera.id);
  return (
    <button
      type="button"
      onClick={() => onOpen(camera)}
      className="mt-3 block w-full overflow-hidden rounded-xl border border-slate-200 text-start hover:border-brand-500 dark:border-slate-800"
      data-testid="home-camera-preview"
    >
      {showImage ? (
        // eslint-disable-next-line @next/next/no-img-element -- proxied live camera image
        <img
          key={camera.id}
          src={`/api/cameras/${camera.id}/image`}
          alt={t("cameras.imageAlt", { name: camera.name })}
          className="aspect-video w-full bg-slate-100 object-cover dark:bg-slate-800"
          referrerPolicy="no-referrer"
          onError={() => setFailedIds((ids) => [...ids, camera.id])}
        />
      ) : null}
      <span className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
        <span className="truncate font-medium">{camera.name}</span>
        <span className="shrink-0 text-xs text-slate-500">
          {t("cameras.away", { distance: formatDistance(camera.distanceM) })}
        </span>
      </span>
    </button>
  );
}
