"use client";

import { useState } from "react";
import { ExternalIcon, PhotoIcon } from "@/components/icons";
import { Card, CardSkeleton, Notice, SectionUnavailable, Spinner, cx } from "@/components/ui";
import { useI18n } from "@/i18n/I18nProvider";
import type { Section, StreetPhoto } from "@/lib/types";

const CONTRIBUTE_URL = "https://panoramax.fr/";

/**
 * Published photos of the place: street-level imagery and geotagged photos.
 * Images come through /api/photos/:id/image, so the browser never contacts
 * the photo hosts directly.
 */
export function PhotosCard({
  section,
  loading,
  radiusM,
  title,
  id = "photos",
}: {
  section: Section<StreetPhoto[]> | undefined;
  loading: boolean;
  radiusM: number;
  title?: string;
  id?: string;
}) {
  const { t, locale, formatDistance } = useI18n();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loadedId, setLoadedId] = useState<string | null>(null);
  const [failedId, setFailedId] = useState<string | null>(null);
  const photos = section?.status === "ok" ? section.data : [];
  const selected = photos.find((p) => p.id === selectedId) ?? photos[0];
  const monthYear = (iso: string) =>
    new Intl.DateTimeFormat(locale === "he" ? "he-IL" : "en-GB", {
      month: "short",
      year: "numeric",
    }).format(new Date(iso));

  return (
    <Card id={id} title={title ?? t("photos.title")} icon={<PhotoIcon />}>
      {loading || !section ? (
        <CardSkeleton />
      ) : section.status === "unavailable" ? (
        <SectionUnavailable section={section} />
      ) : photos.length === 0 ? (
        <Notice>
          {t("photos.none", { radius: formatDistance(radiusM) })}{" "}
          <a
            href={CONTRIBUTE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium underline"
          >
            {t("photos.contribute")}
          </a>
        </Notice>
      ) : (
        <div className="space-y-3" data-testid="photos">
          {selected ? (
            <figure className="space-y-2">
              <div className="relative aspect-video overflow-hidden rounded-xl bg-slate-900">
                {failedId === selected.id ? (
                  <div className="flex size-full items-center justify-center p-4 text-center text-sm text-slate-300">
                    {t("photos.imageError")}
                  </div>
                ) : (
                  <>
                    {loadedId !== selected.id ? (
                      <div className="absolute inset-0 flex items-center justify-center text-slate-400">
                        <Spinner className="size-6" />
                      </div>
                    ) : null}
                    {/* eslint-disable-next-line @next/next/no-img-element -- proxied third-party photo */}
                    <img
                      key={selected.id}
                      src={`/api/photos/${selected.id}/image?size=large`}
                      alt={selected.title ?? t("photos.alt")}
                      className="size-full object-contain"
                      onLoad={() => setLoadedId(selected.id)}
                      onError={() => setFailedId(selected.id)}
                      referrerPolicy="no-referrer"
                      data-testid="photo-large"
                    />
                  </>
                )}
              </div>
              <figcaption className="space-y-0.5 text-sm">
                <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                    {t(selected.kind === "street" ? "photos.street" : "photos.photo")}
                    {selected.panorama ? ` · ${t("photos.panorama")}` : ""}
                  </span>
                  <span className="font-medium">
                    {selected.capturedAt
                      ? t("photos.taken", { date: monthYear(selected.capturedAt) })
                      : t("photos.dateUnknown")}
                  </span>
                  <span className="text-slate-500">
                    {t("photos.away", { distance: formatDistance(selected.distanceM) })}
                  </span>
                </p>
                {selected.title ? (
                  <p className="text-slate-700 dark:text-slate-300">{selected.title}</p>
                ) : null}
                <p className="text-xs text-slate-500" data-testid="photo-credit">
                  {selected.author ? `© ${selected.author} · ` : ""}
                  {selected.license.url ? (
                    <a
                      href={selected.license.url}
                      target="_blank"
                      rel="noopener noreferrer license"
                      className="underline hover:text-brand-700"
                    >
                      {selected.license.name}
                    </a>
                  ) : (
                    selected.license.name
                  )}{" "}
                  ·{" "}
                  <a
                    href={selected.pageUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 underline hover:text-brand-700"
                  >
                    {t(
                      selected.providerId === "panoramax"
                        ? "photos.onPanoramax"
                        : "photos.onCommons",
                    )}
                    <ExternalIcon />
                  </a>
                </p>
              </figcaption>
            </figure>
          ) : null}
          <ul className="grid grid-cols-4 gap-2 sm:grid-cols-6" data-testid="photo-list">
            {photos.map((photo) => {
              const isSelected = photo.id === selected?.id;
              return (
                <li key={photo.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(photo.id)}
                    aria-pressed={isSelected}
                    aria-label={
                      photo.capturedAt
                        ? `${photo.title ?? t("photos.alt")} · ${monthYear(photo.capturedAt)}`
                        : (photo.title ?? t("photos.alt"))
                    }
                    className={cx(
                      "relative block aspect-square w-full overflow-hidden rounded-lg bg-slate-100 ring-2 transition dark:bg-slate-800",
                      isSelected ? "ring-brand-500" : "ring-transparent hover:ring-slate-300",
                    )}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element -- proxied third-party photo */}
                    <img
                      src={`/api/photos/${photo.id}/image?size=thumb`}
                      alt=""
                      loading="lazy"
                      className="size-full object-cover"
                      referrerPolicy="no-referrer"
                    />
                    {photo.capturedAt ? (
                      <span className="absolute inset-x-0 bottom-0 bg-black/55 px-1 py-0.5 text-center text-[10px] font-medium text-white tabular-nums">
                        {new Date(photo.capturedAt).getUTCFullYear()}
                      </span>
                    ) : null}
                  </button>
                </li>
              );
            })}
          </ul>
          <p className="text-xs text-slate-500">{t("photos.notLive")}</p>
        </div>
      )}
    </Card>
  );
}
