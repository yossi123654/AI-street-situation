"use client";

import { CameraViewer } from "@/components/CameraViewer";
import { CameraIcon, ExternalIcon } from "@/components/icons";
import { Card, CardSkeleton, Notice, SectionUnavailable, cx } from "@/components/ui";
import { useI18n } from "@/i18n/I18nProvider";
import type { CameraView, Section } from "@/lib/types";

export function CamerasCard({
  section,
  radiusM,
  selectedId,
  onSelect,
  aiEnabled,
}: {
  section: Section<CameraView[]> | undefined;
  radiusM: number;
  selectedId: string | null;
  onSelect: (id: string) => void;
  aiEnabled: boolean;
}) {
  const { t, formatDistance } = useI18n();
  const radius = formatDistance(radiusM);
  const cameras = section?.status === "ok" ? section.data : [];
  const selected = cameras.find((c) => c.id === selectedId) ?? cameras[0];

  return (
    <Card id="cameras" title={t("cameras.title")} icon={<CameraIcon />}>
      {!section ? (
        <CardSkeleton />
      ) : section.status === "unavailable" ? (
        <SectionUnavailable section={section} />
      ) : cameras.length === 0 ? (
        <Notice>{t("cameras.none", { radius })}</Notice>
      ) : (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          <div>{selected ? <CameraViewer camera={selected} aiEnabled={aiEnabled} /> : null}</div>
          <div>
            <p className="mb-2 text-sm text-slate-500">
              {t("cameras.count", { count: cameras.length, radius })}
            </p>
            <ul className="max-h-80 space-y-1.5 overflow-y-auto pe-1" data-testid="camera-list">
              {cameras.map((camera) => {
                const isSelected = camera.id === selected?.id;
                return (
                  <li key={camera.id}>
                    <button
                      type="button"
                      onClick={() => onSelect(camera.id)}
                      aria-pressed={isSelected}
                      className={cx(
                        "w-full rounded-xl border px-3 py-2 text-start transition-colors",
                        isSelected
                          ? "border-brand-500 bg-brand-50 dark:bg-slate-800"
                          : "border-slate-200 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/60",
                      )}
                    >
                      <span className="flex items-start justify-between gap-2">
                        <span className="text-sm font-medium">{camera.name}</span>
                        <span className="shrink-0 text-xs text-slate-500 tabular-nums">
                          {t("cameras.away", { distance: formatDistance(camera.distanceM) })}
                        </span>
                      </span>
                      <span className="mt-1 flex flex-wrap gap-1.5 text-xs">
                        <span className="rounded bg-slate-100 px-1.5 py-0.5 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                          {t(`cameras.type.${camera.cameraType}`)}
                        </span>
                        {camera.display === "link" ? (
                          <span className="inline-flex items-center gap-1 rounded bg-amber-50 px-1.5 py-0.5 text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                            <ExternalIcon /> {t("cameras.linkOnly")}
                          </span>
                        ) : null}
                        <span className="text-slate-500">{camera.operator.name}</span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      )}
    </Card>
  );
}
