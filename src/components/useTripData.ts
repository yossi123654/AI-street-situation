"use client";

import { useEffect, useState } from "react";
import type { SummaryState } from "@/components/SummaryCard";
import type { TripEndpoint } from "@/components/TripSearch";
import { ApiRequestError, apiGet } from "@/lib/apiClient";
import type { AiSummary, Locale, Section, TripReport, TripStop } from "@/lib/types";

export interface TripSelection {
  from: TripEndpoint;
  to: TripEndpoint;
  /** ISO time; absent means "leave now". */
  departAt?: string;
}

export type TripState =
  { status: "loading" } | { status: "ok"; data: TripReport } | { status: "error"; code?: string };

function tripParams(trip: TripSelection, locale: Locale) {
  const params = new URLSearchParams({
    from: `${trip.from.lat.toFixed(5)},${trip.from.lon.toFixed(5)}`,
    to: `${trip.to.lat.toFixed(5)},${trip.to.lon.toFixed(5)}`,
    lang: locale,
  });
  if (trip.from.label) params.set("fromLabel", trip.from.label);
  if (trip.to.label) params.set("toLabel", trip.to.label);
  if (trip.departAt) params.set("depart", trip.departAt);
  return params;
}

/**
 * Loads a trip: the report, then stops (separately, Overpass is slow) and the
 * AI briefing. Loading state is derived from request keys, so nothing is set
 * synchronously inside effects.
 */
export function useTripData(
  trip: TripSelection | null,
  locale: Locale,
  aiEnabled: boolean,
  reloadToken: number,
) {
  const key = trip ? `${tripParams(trip, locale).toString()}|${reloadToken}` : null;

  const [reportResult, setReportResult] = useState<{ key: string; state: TripState } | null>(null);
  useEffect(() => {
    if (!key || !trip) return;
    const controller = new AbortController();
    apiGet<TripReport>(`/api/trip?${tripParams(trip, locale)}`, { signal: controller.signal })
      .then((data) => setReportResult({ key, state: { status: "ok", data } }))
      .catch((error) => {
        if (controller.signal.aborted) return;
        setReportResult({
          key,
          state: {
            status: "error",
            ...(error instanceof ApiRequestError ? { code: error.code } : {}),
          },
        });
      });
    return () => controller.abort();
    // `trip` is fully described by `key`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  const report: TripState | null = !key
    ? null
    : reportResult?.key === key
      ? reportResult.state
      : { status: "loading" };

  const [stopsResult, setStopsResult] = useState<{
    key: string;
    section: Section<TripStop[]>;
  } | null>(null);
  const stopsKey = report?.status === "ok" && report.data.route.status === "ok" ? key : null;
  useEffect(() => {
    if (!stopsKey || !trip) return;
    const controller = new AbortController();
    apiGet<Section<TripStop[]>>(`/api/trip/stops?${tripParams(trip, locale)}`, {
      signal: controller.signal,
    })
      .then((section) => setStopsResult({ key: stopsKey, section }))
      .catch(() => {
        if (!controller.signal.aborted)
          setStopsResult({ key: stopsKey, section: { status: "unavailable", reason: "error" } });
      });
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stopsKey]);
  const stopsLoading = Boolean(stopsKey) && stopsResult?.key !== stopsKey;
  const stops = stopsResult?.key === stopsKey ? stopsResult.section : undefined;

  const [summaryResult, setSummaryResult] = useState<{ key: string; state: SummaryState } | null>(
    null,
  );
  const summaryKey = report?.status === "ok" && aiEnabled ? key : null;
  useEffect(() => {
    if (!summaryKey || !trip) return;
    const controller = new AbortController();
    apiGet<AiSummary>(`/api/trip/summary?${tripParams(trip, locale)}`, {
      signal: controller.signal,
    })
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [summaryKey]);
  const summary: SummaryState =
    report?.status !== "ok"
      ? { status: "idle" }
      : !aiEnabled
        ? { status: "not_configured" }
        : summaryResult?.key === summaryKey
          ? summaryResult.state
          : { status: "loading" };

  return { report, stops, stopsLoading, summary };
}
