"use client";

import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { useEffect, useMemo } from "react";
import { MapContainer, Marker, TileLayer, Tooltip, useMap, useMapEvents } from "react-leaflet";
import type { SelectedPlace } from "@/components/StreetSituationApp";
import { useI18n } from "@/i18n/I18nProvider";
import type { CameraView, MapConfig } from "@/lib/types";

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
  selectedCameraId,
  onPick,
  onSelectCamera,
}: {
  config: MapConfig;
  place: SelectedPlace | null;
  cameras: CameraView[];
  selectedCameraId: string | null;
  onPick: (point: { lat: number; lon: number }) => void;
  onSelectCamera: (id: string) => void;
}) {
  const { t } = useI18n();
  const icons = useMemo(
    () => ({
      embed: cameraIcon("embed", false),
      link: cameraIcon("link", false),
      embedSelected: cameraIcon("embed", true),
      linkSelected: cameraIcon("link", true),
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
        <TileLayer url={config.tileUrl} attribution={config.attribution} maxZoom={config.maxZoom} />
        <ClickHandler onPick={onPick} />
        <FlyTo place={place} />
        {place ? (
          <Marker position={[place.lat, place.lon]} icon={placeIcon} keyboard={false}>
            <Tooltip direction="top" offset={[0, -36]}>
              {place.label ?? t("map.selected")}
            </Tooltip>
          </Marker>
        ) : null}
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
