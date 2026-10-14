"use client";

import { useEffect, useRef, useState } from "react";
import { NavigateIcon, ParkingIcon } from "@/components/icons";
import { Card, CardSkeleton, Notice, SectionUnavailable, Spinner, cx } from "@/components/ui";
import { useI18n } from "@/i18n/I18nProvider";
import type { ParkingFacility, Section } from "@/lib/types";

type Filter = "all" | "free" | "public";

const FEE_STYLE: Record<ParkingFacility["fee"], string> = {
  no: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  yes: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300",
  unknown: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
};

export function applyParkingFilter(items: ParkingFacility[], filter: Filter): ParkingFacility[] {
  if (filter === "free") return items.filter((p) => p.fee === "no");
  if (filter === "public")
    return items.filter((p) => p.access === "public" || p.access === "unknown");
  return items;
}

export function ParkingCard({
  section,
  loading,
  radiusM,
  selectedId,
  onSelect,
}: {
  section: Section<ParkingFacility[]> | undefined;
  loading: boolean;
  radiusM: number;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const { t, formatDistance } = useI18n();
  const [filter, setFilter] = useState<Filter>("all");
  const listRef = useRef<HTMLUListElement>(null);
  const radius = formatDistance(radiusM);
  const all = section?.status === "ok" ? section.data : [];
  const items = applyParkingFilter(all, filter);

  // Bring the selected facility into view when it is picked on the map.
  useEffect(() => {
    if (!selectedId) return;
    listRef.current
      ?.querySelector(`[data-parking-id="${CSS.escape(selectedId)}"]`)
      ?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [selectedId]);

  return (
    <Card id="parking" title={t("parking.title")} icon={<ParkingIcon />}>
      {loading && !section ? (
        <div className="space-y-3">
          <p className="flex items-center gap-2 text-sm text-slate-500">
            <Spinner /> {t("parking.loading")}
          </p>
          <CardSkeleton />
        </div>
      ) : !section ? null : section.status === "unavailable" ? (
        <SectionUnavailable section={section} />
      ) : all.length === 0 ? (
        <Notice>{t("parking.none", { radius })}</Notice>
      ) : (
        <div className="space-y-3" data-testid="parking">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-slate-500">
              {t("parking.count", { count: all.length, radius })}
            </p>
            <div
              role="group"
              aria-label={t("parking.filter.label")}
              className="flex gap-1 rounded-lg bg-slate-100 p-0.5 text-xs dark:bg-slate-800"
            >
              {(["all", "free", "public"] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={filter === value}
                  onClick={() => setFilter(value)}
                  className={cx(
                    "rounded-md px-2.5 py-1 font-medium",
                    filter === value
                      ? "bg-white text-slate-900 shadow-sm dark:bg-slate-950 dark:text-slate-100"
                      : "text-slate-600 hover:text-slate-900 dark:text-slate-400",
                  )}
                >
                  {t(`parking.filter.${value}`)}
                </button>
              ))}
            </div>
          </div>

          {items.length === 0 ? (
            <Notice>{t("parking.filteredNone")}</Notice>
          ) : (
            <ul
              ref={listRef}
              className="max-h-96 space-y-1.5 overflow-y-auto pe-1"
              data-testid="parking-list"
            >
              {items.map((p) => (
                <ParkingItem
                  key={p.id}
                  parking={p}
                  selected={p.id === selectedId}
                  onSelect={onSelect}
                />
              ))}
            </ul>
          )}
          <p className="text-xs text-slate-500">{t("parking.noOccupancy")}</p>
        </div>
      )}
    </Card>
  );
}

function ParkingItem({
  parking: p,
  selected,
  onSelect,
}: {
  parking: ParkingFacility;
  selected: boolean;
  onSelect: (id: string) => void;
}) {
  const { t, formatDistance, formatNumber, formatRelative } = useI18n();
  const details = [
    p.capacity !== null ? t("parking.capacity", { count: formatNumber(p.capacity) }) : null,
    p.capacityDisabled ? t("parking.disabled", { count: formatNumber(p.capacityDisabled) }) : null,
    p.openingHours ? t("parking.hours", { hours: p.openingHours }) : null,
    p.maxStay ? t("parking.maxStay", { value: p.maxStay }) : null,
    p.operator ? t("parking.operator", { name: p.operator }) : null,
  ].filter(Boolean);
  const destination = `${p.lat.toFixed(6)},${p.lon.toFixed(6)}`;
  return (
    <li
      data-parking-id={p.id}
      className={cx(
        "rounded-xl border px-3 py-2 transition-colors",
        selected
          ? "border-brand-500 bg-brand-50 dark:bg-slate-800"
          : "border-slate-200 dark:border-slate-800",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <button
          type="button"
          onClick={() => onSelect(p.id)}
          className="min-w-0 text-start"
          aria-pressed={selected}
        >
          <span className="block text-sm font-medium">{p.name ?? t("parking.unnamed")}</span>
          <span className="mt-1 flex flex-wrap gap-1.5 text-xs">
            <span className="rounded bg-slate-100 px-1.5 py-0.5 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
              {t(`parking.kind.${p.kind}`)}
            </span>
            <span className={cx("rounded px-1.5 py-0.5", FEE_STYLE[p.fee])}>
              {t(`parking.fee.${p.fee}`)}
            </span>
            {p.occupancy && p.occupancy.free !== null ? (
              <span
                className="rounded bg-emerald-600 px-1.5 py-0.5 font-medium text-white"
                title={p.occupancy.observedAt}
              >
                {t("parking.freeNow", { count: formatNumber(p.occupancy.free) })} ·{" "}
                {formatRelative(p.occupancy.observedAt)}
              </span>
            ) : null}
            {p.access === "customers" ? (
              <span className="rounded bg-amber-50 px-1.5 py-0.5 text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                {t("parking.access.customers")}
              </span>
            ) : null}
            {p.parkAndRide ? (
              <span className="rounded bg-violet-50 px-1.5 py-0.5 text-violet-800 dark:bg-violet-950 dark:text-violet-300">
                {t("parking.parkRide")}
              </span>
            ) : null}
          </span>
        </button>
        <span className="shrink-0 text-xs text-slate-500 tabular-nums">
          {formatDistance(p.distanceM)}
        </span>
      </div>
      {details.length > 0 ? (
        <p className="mt-1 text-xs text-slate-500" dir="auto">
          {details.join(" · ")}
        </p>
      ) : null}
      <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
        <span className="inline-flex items-center gap-1 text-slate-500">
          <NavigateIcon /> {t("parking.navigate")}:
        </span>
        <a
          className="font-medium text-brand-700 hover:underline dark:text-brand-500"
          href={`https://waze.com/ul?ll=${destination}&navigate=yes`}
          target="_blank"
          rel="noopener noreferrer"
        >
          Waze
        </a>
        <a
          className="font-medium text-brand-700 hover:underline dark:text-brand-500"
          href={`https://www.google.com/maps/dir/?api=1&destination=${destination}`}
          target="_blank"
          rel="noopener noreferrer"
        >
          Google Maps
        </a>
        <a
          className="font-medium text-brand-700 hover:underline dark:text-brand-500"
          href={`https://www.openstreetmap.org/directions?route=%3B${encodeURIComponent(destination)}`}
          target="_blank"
          rel="noopener noreferrer"
        >
          OpenStreetMap
        </a>
      </p>
    </li>
  );
}
