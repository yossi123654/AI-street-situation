"use client";

import { useEffect, useState } from "react";
import { ExternalIcon, RefreshIcon, SparkIcon } from "@/components/icons";
import { FreshnessBadge, Notice, Spinner } from "@/components/ui";
import { useI18n } from "@/i18n/I18nProvider";
import { ApiRequestError, apiGet } from "@/lib/apiClient";
import type { CameraView, Freshness, VisionAnalysis } from "@/lib/types";

interface CameraStatus {
  available: boolean | null;
  imageTime?: string;
  freshness: Freshness;
}

type AnalysisState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ok"; data: VisionAnalysis }
  | { status: "error"; message: string };

const MIN_REFRESH_SECONDS = 15;

export function CameraViewer({ camera, aiEnabled }: { camera: CameraView; aiEnabled: boolean }) {
  const { t, locale, formatDuration } = useI18n();
  const [tick, setTick] = useState(0);
  const [imageFailed, setImageFailed] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [status, setStatus] = useState<CameraStatus | null>(null);
  const [analysis, setAnalysis] = useState<AnalysisState>({ status: "idle" });
  const refreshSeconds = Math.max(MIN_REFRESH_SECONDS, camera.refreshSeconds);
  const isImage = camera.display === "embed" && camera.mediaType === "image";

  // Reset when switching cameras.
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- reset local state for a new camera */
    setTick(0);
    setImageFailed(false);
    setImageLoaded(false);
    setStatus(null);
    setAnalysis({ status: "idle" });
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [camera.id]);

  // Refresh the image at the source's recommended interval, only while the tab is visible.
  useEffect(() => {
    if (!isImage) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") setTick((n) => n + 1);
    }, refreshSeconds * 1000);
    return () => window.clearInterval(timer);
  }, [isImage, refreshSeconds]);

  useEffect(() => {
    if (!isImage) return;
    const controller = new AbortController();
    apiGet<CameraStatus>(`/api/cameras/${camera.id}/status`, { signal: controller.signal })
      .then(setStatus)
      .catch(() => undefined);
    return () => controller.abort();
  }, [camera.id, isImage, tick]);

  const analyze = async () => {
    setAnalysis({ status: "loading" });
    try {
      const response = await fetch(`/api/cameras/${camera.id}/analyze?lang=${locale}`, {
        method: "POST",
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new ApiRequestError(
          body?.error?.code ?? "error",
          body?.error?.message ?? "",
          response.status,
        );
      }
      setAnalysis({ status: "ok", data: (await response.json()) as VisionAnalysis });
    } catch (error) {
      setAnalysis({
        status: "error",
        message:
          error instanceof ApiRequestError && error.code === "forbidden"
            ? t("cameras.analysisNotAllowed")
            : t("cameras.analysisError"),
      });
    }
  };

  return (
    <div className="space-y-3" data-testid="camera-viewer">
      {camera.display === "link" ? (
        <div className="rounded-xl border border-dashed border-slate-300 p-4 dark:border-slate-700">
          <p className="font-medium">{camera.name}</p>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            {t("cameras.linkOnlyExplain")}
          </p>
          <a
            href={camera.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 inline-flex items-center gap-2 rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-700 dark:bg-slate-100 dark:text-slate-900"
          >
            <ExternalIcon /> {t("cameras.openSource")}
          </a>
        </div>
      ) : camera.mediaType === "video" && camera.videoUrl ? (
        <video
          key={camera.id}
          src={camera.videoUrl}
          className="aspect-video w-full rounded-xl bg-black"
          autoPlay
          muted
          loop
          playsInline
          controls
          aria-label={t("cameras.imageAlt", { name: camera.name })}
        />
      ) : (
        <div className="relative aspect-video overflow-hidden rounded-xl bg-slate-100 dark:bg-slate-800">
          {imageFailed ? (
            <div className="flex size-full items-center justify-center p-4 text-center text-sm text-slate-500">
              {t("cameras.imageError")}
            </div>
          ) : (
            <>
              {!imageLoaded ? (
                <div className="absolute inset-0 flex items-center justify-center text-slate-400">
                  <Spinner className="size-6" />
                </div>
              ) : null}
              {/* eslint-disable-next-line @next/next/no-img-element -- proxied live image, must not be optimised or cached */}
              <img
                src={`/api/cameras/${camera.id}/image?v=${tick}`}
                alt={t("cameras.imageAlt", { name: camera.name })}
                className="size-full object-cover"
                onLoad={() => setImageLoaded(true)}
                onError={() => setImageFailed(true)}
                referrerPolicy="no-referrer"
              />
            </>
          )}
        </div>
      )}

      {isImage ? (
        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
          {status ? <FreshnessBadge freshness={status.freshness} time={status.imageTime} /> : null}
          {status && !status.imageTime ? <span>{t("cameras.imageTimeUnknown")}</span> : null}
          <span className="inline-flex items-center gap-1">
            <RefreshIcon />{" "}
            {t("cameras.refreshEvery", { interval: formatDuration(refreshSeconds) })}
          </span>
        </div>
      ) : null}

      <p className="text-xs text-slate-500">
        {t("cameras.operator", { name: camera.operator.name })}
        {camera.license.attribution ? ` · ${camera.license.attribution}` : ""} ·{" "}
        <a
          href={camera.license.termsUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="underline hover:text-brand-700"
        >
          {t("cameras.license")}
        </a>{" "}
        ·{" "}
        <a
          href={camera.sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="underline hover:text-brand-700"
        >
          {t("cameras.openSource")}
        </a>
      </p>

      {camera.analyzable && aiEnabled ? (
        <div>
          {analysis.status === "idle" ? (
            <button
              type="button"
              onClick={analyze}
              className="inline-flex items-center gap-2 rounded-lg border border-brand-500 px-3 py-1.5 text-sm font-medium text-brand-700 hover:bg-brand-50 dark:text-brand-500 dark:hover:bg-slate-800"
              data-testid="analyze-camera"
            >
              <SparkIcon /> {t("cameras.analyze")}
            </button>
          ) : analysis.status === "loading" ? (
            <p className="flex items-center gap-2 text-sm text-slate-600">
              <Spinner /> {t("cameras.analyzing")}
            </p>
          ) : analysis.status === "error" ? (
            <Notice tone="warning">{analysis.message}</Notice>
          ) : (
            <AnalysisResult analysis={analysis.data} />
          )}
        </div>
      ) : null}
    </div>
  );
}

function AnalysisResult({ analysis }: { analysis: VisionAnalysis }) {
  const { t } = useI18n();
  return (
    <div
      className="rounded-xl bg-brand-50 p-3 text-sm dark:bg-slate-800"
      data-testid="camera-analysis"
    >
      <p className="mb-1 flex items-center gap-1.5 font-semibold">
        <SparkIcon className="text-brand-600" /> {t("cameras.analysisTitle")}
      </p>
      <p>
        <strong>{t(`cameras.trafficLevel.${analysis.traffic.level}`)}</strong>
        {analysis.traffic.description ? ` — ${analysis.traffic.description}` : ""}
      </p>
      {analysis.weather ? <p className="mt-0.5">{analysis.weather}</p> : null}
      <p className="mt-0.5">
        {t("cameras.visibility", { value: t(`cameras.visibilityLevel.${analysis.visibility}`) })}
      </p>
      {analysis.notes ? (
        <p className="mt-0.5 text-slate-600 dark:text-slate-400">{analysis.notes}</p>
      ) : null}
      <p className="mt-2 text-xs text-slate-500">
        {t("cameras.analysisDisclaimer", {
          level: t(`cameras.uncertainty.${analysis.uncertainty}`),
        })}{" "}
        · {analysis.provider.name} ({analysis.provider.model})
      </p>
    </div>
  );
}
