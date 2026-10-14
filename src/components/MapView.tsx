"use client";

import "leaflet/dist/leaflet.css";
import "maplibre-gl/dist/maplibre-gl.css";
import L from "leaflet";
import { useEffect, useMemo, useState } from "react";
import { MapContainer, Marker, TileLayer, Tooltip, useMap, useMapEvents } from "react-leaflet";
import type { SelectedPlace } from "@/components/StreetSituationApp";
import { useI18n } from "@/i18n/I18nProvider";
import type { CameraView, MapConfig, ParkingFacility } from "@/lib/types";

const placeIcon = L.divIcon({
  className: "place-marker",
  html: `<svg viewBox="0 0 32 42" width="32" height="42" aria-hidden="true"><path d="M16 1C7.7 1 1 7.6 1 15.8 1 27 16 41 16 41s15-14 15-25.2C31 7.6 24.3 1 16 1z" fill="#0e7490" stroke="white" stroke-width="2"/><circle cx="16" cy="15.5" r="5.5" fill="white"/></svg>`,
  iconSize: [32, 42],
  iconAnchor: [16, 41],
});

function cameraIcon(kind: "embed" | "link", selected: boolean) {
  const fill = kind === "embed" ? "#0891b2" : "#64748b";
  const size = selected ? 34 : 26;
  return L.divIcon({
    className: "camera-marker",
    html: `<svg viewBox="0 0 26 26" width="${size}" height="${size}" aria-hidden="true"><circle cx="13" cy="13" r="12" fill="${fill}" stroke="${selected ? "#f59e0b" : "white"}" stroke-width="${selected ? 3 : 2}"/><rect x="7" y="9" width="12" height="9" rx="1.5" fill="white"/><circle cx="13" cy="13.5" r="2.4" fill="${fill}"/></svg>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

function parkingIcon(selected: boolean) {
  const size = selected ? 28 : 20;
  return L.divIcon({
    className: "parking-marker",
    html: `<svg viewBox="0 0 20 20" width="${size}" height="${size}" aria-hidden="true"><rect x="1" y="1" width="18" height="18" rx="4" fill="#1d4ed8" stroke="${selected ? "#f59e0b" : "white"}" stroke-width="${selected ? 2.5 : 1.5}"/><path d="M7.5 15V5h3.2a2.9 2.9 0 0 1 0 5.8H7.5" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

const MAPLIBRE_WORKER_PATH = "/vendor/maplibre-gl/maplibre-gl-worker.mjs";

/**
 * Vector base map rendered by MapLibre inside Leaflet (OpenFreeMap by default).
 * MapLibre is loaded on demand; if WebGL or the style is unavailable we fall
 * back to the raster tiles.
 */
/** Map label expression for a UI language: the localized name, falling back to the local one. */
export function labelExpression(locale: string): unknown[] {
  return locale === "en"
    ? ["coalesce", ["get", "name:en"], ["get", "name:latin"], ["get", "name"]]
    : ["coalesce", ["get", `name:${locale}`], ["get", "name"]];
}

type GlMap = ReturnType<L.MaplibreGL["getMaplibreMap"]>;

/** Shows place and street names in the UI language instead of the style's Latin + local labels. */
function localizeLabels(glMap: GlMap, locale: string) {
  const expression = labelExpression(locale);
  for (const layer of glMap.getStyle()?.layers ?? []) {
    if (layer.type !== "symbol") continue;
    const field = glMap.getLayoutProperty(layer.id, "text-field");
    // Leave road-number shields ("ref") and other non-name labels alone.
    if (field && JSON.stringify(field).includes('"name')) {
      glMap.setLayoutProperty(layer.id, "text-field", expression as never);
    }
  }
}

function VectorBaseLayer({
  styleUrl,
  attribution,
  locale,
  onFail,
}: {
  styleUrl: string;
  attribution: string;
  locale: string;
  onFail: () => void;
}) {
  const map = useMap();
  const [glMap, setGlMap] = useState<GlMap | null>(null);

  useEffect(() => {
    if (!glMap) return;
    if (glMap.isStyleLoaded()) localizeLabels(glMap, locale);
    else glMap.once("load", () => localizeLabels(glMap, locale));
  }, [glMap, locale]);

  useEffect(() => {
    let layer: L.Layer | undefined;
    let cancelled = false;
    (async () => {
      try {
        const [{ maplibreGL }, maplibre] = await Promise.all([
          import("@maplibre/maplibre-gl-leaflet"),
          import("maplibre-gl"),
        ]);
        if (cancelled) return;
        // The worker is served from public/vendor (see scripts/copy-vendor.mjs).
        maplibre.setWorkerUrl(new URL(MAPLIBRE_WORKER_PATH, window.location.origin).href);
        // The plugin reads the Leaflet attribution from attributionControl.customAttribution.
        const glLayer = maplibreGL({
          style: styleUrl,
          attributionControl: { customAttribution: attribution },
        });
        glLayer.addTo(map);
        layer = glLayer;
        const instance = glLayer.getMaplibreMap();
        let loaded = false;
        instance.once("load", () => {
          loaded = true;
        });
        instance.on(
          "error",
          (event: { error?: { message?: string }; sourceId?: string; tile?: unknown }) => {
            // Fall back only when the style itself cannot load, not for a single failed tile.
            const tileError = event.sourceId !== undefined || event.tile !== undefined;
            if (!loaded && !tileError && !cancelled) onFail();
            console.warn("[map] vector map error:", event.error?.message ?? event);
          },
        );
        setGlMap(instance);
      } catch (error) {
        console.warn("[map] vector map unavailable, using raster tiles:", error);
        if (!cancelled) onFail();
      }
    })();
    return () => {
      cancelled = true;
      setGlMap(null);
      if (layer) map.removeLayer(layer);
    };
  }, [map, styleUrl, attribution, onFail]);
  return null;
}

function ClickHandler({ onPick }: { onPick: (point: { lat: number; lon: number }) => void }) {
  useMapEvents({
    click(event) {
      onPick({ lat: event.latlng.lat, lon: event.latlng.lng });
    },
  });
  return null;
}

function FlyTo({ place }: { place: SelectedPlace | null }) {
  const map = useMap();
  const lat = place?.lat;
  const lon = place?.lon;
  useEffect(() => {
    if (lat === undefined || lon === undefined) return;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const zoom = Math.max(map.getZoom(), 15);
    if (reduceMotion) map.setView([lat, lon], zoom);
    else map.flyTo([lat, lon], zoom, { duration: 0.8 });
  }, [map, lat, lon]);
  return null;
}

export function MapView({
  config,
  place,
  cameras,
  parking,
  selectedCameraId,
  selectedParkingId,
  onPick,
  onSelectCamera,
  onSelectParking,
}: {
  config: MapConfig;
  place: SelectedPlace | null;
  cameras: CameraView[];
  parking: ParkingFacility[];
  selectedCameraId: string | null;
  selectedParkingId: string | null;
  onPick: (point: { lat: number; lon: number }) => void;
  onSelectCamera: (id: string) => void;
  onSelectParking: (id: string) => void;
}) {
  const { t, locale } = useI18n();
  const [vectorFailed, setVectorFailed] = useState(false);
  const onVectorFail = useMemo(() => () => setVectorFailed(true), []);
  const icons = useMemo(
    () => ({
      embed: cameraIcon("embed", false),
      link: cameraIcon("link", false),
      embedSelected: cameraIcon("embed", true),
      linkSelected: cameraIcon("link", true),
      parking: parkingIcon(false),
      parkingSelected: parkingIcon(true),
    }),
    [],
  );

  return (
    // Leaflet controls assume LTR layout.
    <div dir="ltr" className="size-full" data-testid="map">
      <MapContainer
        center={config.defaultCenter}
        zoom={config.defaultZoom}
        maxZoom={config.maxZoom}
        scrollWheelZoom
        className="size-full"
        aria-label={t("map.label")}
      >
        {config.vector && !vectorFailed ? (
          <VectorBaseLayer
            styleUrl={config.vector.styleUrl}
            attribution={config.vector.attribution}
            locale={locale}
            onFail={onVectorFail}
          />
        ) : (
          <TileLayer
            url={config.tileUrl}
            attribution={config.attribution}
            maxZoom={config.maxZoom}
          />
        )}
        <ClickHandler onPick={onPick} />
        <FlyTo place={place} />
        {place ? (
          <Marker position={[place.lat, place.lon]} icon={placeIcon} keyboard={false}>
            <Tooltip direction="top" offset={[0, -36]}>
              {place.label ?? t("map.selected")}
            </Tooltip>
          </Marker>
        ) : null}
        {parking.map((p) => {
          const selected = p.id === selectedParkingId;
          return (
            <Marker
              key={p.id}
              position={[p.lat, p.lon]}
              icon={selected ? icons.parkingSelected : icons.parking}
              zIndexOffset={selected ? 900 : -100}
              eventHandlers={{ click: () => onSelectParking(p.id) }}
              title={p.name ?? t("map.parking")}
              alt={p.name ?? t("map.parking")}
            >
              <Tooltip direction="top" offset={[0, -10]}>
                {p.name ?? t("map.parking")}
              </Tooltip>
            </Marker>
          );
        })}
        {cameras.map((camera) => {
          const selected = camera.id === selectedCameraId;
          const icon =
            camera.display === "embed"
              ? selected
                ? icons.embedSelected
                : icons.embed
              : selected
                ? icons.linkSelected
                : icons.link;
          return (
            <Marker
              key={camera.id}
              position={[camera.lat, camera.lon]}
              icon={icon}
              zIndexOffset={selected ? 1000 : 0}
              eventHandlers={{ click: () => onSelectCamera(camera.id) }}
              title={camera.name}
              alt={camera.name}
            >
              <Tooltip direction="top" offset={[0, -12]}>
                <strong>{camera.name}</strong>
                <br />
                {camera.display === "embed" ? t("map.cameraEmbed") : t("map.cameraLink")}
              </Tooltip>
            </Marker>
          );
        })}
      </MapContainer>
    </div>
  );
}
