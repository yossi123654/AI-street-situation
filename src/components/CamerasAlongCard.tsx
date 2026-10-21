"use client";

import { CameraViewer } from "@/components/CameraViewer";
import { CameraIcon, ExternalIcon } from "@/components/icons";
import { Card, CardSkeleton, Notice, SectionUnavailable, cx } from "@/components/ui";
import { useI18n } from "@/i18n/I18nProvider";
import type { Section, TripCamera } from "@/lib/types";

const ADD_CAMERA_URL =
  "https://github.com/yossi123654/ai-street-situation/blob/main/docs/adding-a-camera.md";

/** Cameras near the route, as a strip in the order the traveller passes them. */
export function CamerasAlongCard({
  section,
  departureIsNow,
  selectedId,
  onSelect,
  aiEnabled,
}: {
  section: Section<TripCamera[]> | undefined;
  departureIsNow: boolean;
  selectedId: string | null;
  onSelect: (id: string) => void;
  aiEnabled: boolean;
}) {
  const { t, formatDistance, formatDuration } = useI18n();
  const cameras = section?.status === "ok" ? section.data : [];
  const selected = cameras.find((c) => c.id === selectedId) ?? cameras[0];

  return (
    <Card id="trip-cameras" title={t("trip.camerasTitle")} icon={<CameraIcon />}>
      {!section ? (
        <CardSkeleton />
      ) : section.status === "unavailable" && section.reason !== "no_data" ? (
        <SectionUnavailable section={section} />
      ) : cameras.length === 0 ? (
        <Notice>
          {t("trip.camerasNone")}{" "}
          <a
            href={ADD_CAMERA_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium underline"
          >
            {t("trip.camerasAdd")}
          </a>
        </Notice>
      ) : (
        <div className="space-y-3" data-testid="trip-cameras">
          <p className="text-sm text-slate-500">
            {t("trip.camerasCount", { count: cameras.length })}
            {departureIsNow ? "" : ` ${t("trip.camerasNowNote")}`}
          </p>
          <ol
            className="flex snap-x gap-2 overflow-x-auto pb-1"
            aria-label={t("trip.camerasTitle")}
          >
            {cameras.map((camera) => {
              const isSelected = camera.id === selected?.id;
              return (
                <li key={camera.id} className="w-44 shrink-0 snap-start">
                  <button
                    type="button"
                    onClick={() => onSelect(camera.id)}
                    aria-pressed={isSelected}
                    className={cx(
                      "flex h-full w-full flex-col gap-1 rounded-xl border px-3 py-2 text-start transition-colors",
                      isSelected
                        ? "border-brand-500 bg-brand-50 dark:bg-slate-800"
                        : "border-slate-200 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/60",
                    )}
                  >
                    <span className="text-xs font-semibold text-brand-700 tabular-nums dark:text-brand-500">
                      {camera.etaOffsetS < 60
                        ? t("trip.cameraAtStart")
                        : t("trip.cameraIn", { time: formatDuration(camera.etaOffsetS) })}
                      {" · "}
                      {formatDistance(camera.distanceAlongM)}
                    </span>
                    <span className="line-clamp-2 text-sm font-medium">{camera.name}</span>
                    <span className="mt-auto flex flex-wrap items-center gap-1 text-xs text-slate-500">
                      {camera.roadName ? <span>{camera.roadName}</span> : null}
                      {camera.display === "link" ? (
                        <span className="inline-flex items-center gap-1 rounded bg-amber-50 px-1.5 py-0.5 text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                          <ExternalIcon /> {t("cameras.linkOnly")}
                        </span>
                      ) : null}
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
          {selected ? <CameraViewer camera={selected} aiEnabled={aiEnabled} /> : null}
        </div>
      )}
    </Card>
  );
}
