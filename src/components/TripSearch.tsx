"use client";

import { useId, useState, type FormEvent } from "react";
import { LocateIcon, PinIcon, SearchIcon, SwapIcon } from "@/components/icons";
import { Notice, Spinner, cx } from "@/components/ui";
import { useI18n } from "@/i18n/I18nProvider";
import { apiGet } from "@/lib/apiClient";
import type { Place } from "@/lib/types";

export interface TripEndpoint {
  lat: number;
  lon: number;
  label?: string;
}

interface FieldState {
  text: string;
  /** Resolved place for the current text, if any. */
  place?: Place | TripEndpoint;
  candidates?: Place[];
  message?: string;
}

const empty = (): FieldState => ({ text: "" });

/**
 * Origin and destination inputs. Geocoding runs only when the form is
 * submitted (the public Nominatim instance forbids autocomplete); ambiguous
 * fields show a list of candidates to pick from.
 */
export function TripSearch({
  initial,
  onPlan,
}: {
  initial?: { from?: TripEndpoint; to?: TripEndpoint };
  onPlan: (from: TripEndpoint, to: TripEndpoint) => void;
}) {
  const { t, locale } = useI18n();
  const [from, setFrom] = useState<FieldState>(() =>
    initial?.from ? { text: initial.from.label ?? "", place: initial.from } : empty(),
  );
  const [to, setTo] = useState<FieldState>(() =>
    initial?.to ? { text: initial.to.label ?? "", place: initial.to } : empty(),
  );
  const [busy, setBusy] = useState(false);
  const [locating, setLocating] = useState(false);
  const [formMessage, setFormMessage] = useState<string | null>(null);
  const ids = { from: useId(), to: useId() };

  const resolve = async (field: FieldState): Promise<FieldState> => {
    const q = field.text.trim();
    if (field.place && (field.place.label ?? "") === q) return field;
    if (q.length < 2) return { ...field, place: undefined, message: t("search.tooShort") };
    try {
      const { places } = await apiGet<{ places: Place[] }>(
        `/api/geocode?q=${encodeURIComponent(q)}&lang=${locale}`,
      );
      if (places.length === 0) return { text: q, message: t("trip.noResultsFor", { query: q }) };
      if (places.length === 1) return { text: places[0]!.label, place: places[0]! };
      return { text: q, candidates: places };
    } catch {
      return { ...field, place: undefined, message: t("search.error") };
    }
  };

  const submit = async (event?: FormEvent) => {
    event?.preventDefault();
    setFormMessage(null);
    if (!from.text.trim() || !to.text.trim()) {
      setFormMessage(t("trip.fillBoth"));
      return;
    }
    setBusy(true);
    // Sequential on purpose: the server throttles the public geocoder to 1 request/second.
    const resolvedFrom = await resolve(from);
    setFrom(resolvedFrom);
    const resolvedTo = await resolve(to);
    setTo(resolvedTo);
    setBusy(false);
    if (resolvedFrom.place && resolvedTo.place) plan(resolvedFrom.place, resolvedTo.place);
  };

  const plan = (a: TripEndpoint, b: TripEndpoint) => {
    if (Math.abs(a.lat - b.lat) < 0.002 && Math.abs(a.lon - b.lon) < 0.002) {
      setFormMessage(t("trip.samePlace"));
      return;
    }
    onPlan(
      { lat: a.lat, lon: a.lon, ...(a.label ? { label: a.label } : {}) },
      { lat: b.lat, lon: b.lon, ...(b.label ? { label: b.label } : {}) },
    );
  };

  const pick = (which: "from" | "to", place: Place) => {
    const next = { text: place.label, place };
    const other = which === "from" ? to : from;
    if (which === "from") setFrom(next);
    else setTo(next);
    if (other.place)
      plan(which === "from" ? place : other.place, which === "from" ? other.place : place);
  };

  const swap = () => {
    setFrom(to);
    setTo(from);
    if (from.place && to.place) plan(to.place, from.place);
  };

  const locate = () => {
    if (!("geolocation" in navigator)) {
      setFormMessage(t("search.geolocationError"));
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const point = { lat: position.coords.latitude, lon: position.coords.longitude };
        let label = `${point.lat.toFixed(4)}, ${point.lon.toFixed(4)}`;
        try {
          const { place } = await apiGet<{ place: Place | null }>(
            `/api/reverse?lat=${point.lat}&lon=${point.lon}&lang=${locale}`,
          );
          if (place) label = place.label;
        } catch {
          // keep the coordinates as the label
        }
        setLocating(false);
        setFrom({ text: label, place: { ...point, label } });
      },
      () => {
        setLocating(false);
        setFormMessage(t("search.geolocationError"));
      },
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 60_000 },
    );
  };

  const examples: Array<[string, string]> = [
    [t("trip.example1From"), t("trip.example1To")],
    [t("trip.example2From"), t("trip.example2To")],
  ];

  const field = (which: "from" | "to", state: FieldState, set: (s: FieldState) => void) => (
    <div className="min-w-0 flex-1">
      <label htmlFor={ids[which]} className="mb-1 block text-xs font-medium text-slate-500">
        {t(`trip.${which}`)}
      </label>
      <div className="relative">
        <PinIcon
          className={cx(
            "pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-lg",
            which === "from" ? "text-emerald-600" : "text-brand-600",
          )}
        />
        <input
          id={ids[which]}
          type="text"
          value={state.text}
          onChange={(event) => set({ text: event.target.value })}
          placeholder={t(`trip.${which}Placeholder`)}
          autoComplete="off"
          maxLength={200}
          className="h-12 w-full rounded-xl border border-slate-300 bg-white ps-10 pe-3 text-base shadow-sm placeholder:text-slate-400 focus:border-brand-500 focus:ring-4 focus:ring-brand-100 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:focus:ring-brand-900"
          data-testid={`trip-${which}`}
        />
      </div>
      {state.candidates ? (
        <div className="mt-1 rounded-xl border border-slate-200 bg-white p-1.5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <p className="px-2 py-1 text-xs text-slate-500">
            {t("trip.chooseFor", { query: state.text })}
          </p>
          <ul
            className="divide-y divide-slate-100 dark:divide-slate-800"
            data-testid={`trip-${which}-results`}
          >
            {state.candidates.map((place) => (
              <li key={place.id}>
                <button
                  type="button"
                  className="w-full rounded-lg px-2 py-1.5 text-start text-sm hover:bg-slate-50 dark:hover:bg-slate-800"
                  onClick={() => pick(which, place)}
                >
                  {place.label}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {state.message ? (
        <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">{state.message}</p>
      ) : null}
    </div>
  );

  return (
    <form onSubmit={submit} className="space-y-2" data-testid="trip-form">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
        {field("from", from, setFrom)}
        <button
          type="button"
          onClick={swap}
          title={t("trip.swap")}
          className="mx-auto mt-0 flex size-10 shrink-0 items-center justify-center self-center rounded-full border border-slate-300 bg-white text-slate-600 hover:bg-slate-50 sm:mt-6 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
        >
          <SwapIcon className="text-lg sm:rotate-90" />
          <span className="sr-only">{t("trip.swap")}</span>
        </button>
        {field("to", to, setTo)}
        <div className="flex gap-2 sm:mt-6">
          <button
            type="submit"
            disabled={busy}
            className="inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-brand-600 px-5 font-semibold text-white shadow-sm hover:bg-brand-700 disabled:opacity-70 sm:flex-none"
            data-testid="trip-submit"
          >
            {busy ? <Spinner /> : <SearchIcon />}
            {busy ? t("trip.planning") : t("trip.submit")}
          </button>
          <button
            type="button"
            onClick={locate}
            disabled={locating}
            title={t("search.myLocation")}
            className="inline-flex h-12 items-center justify-center rounded-xl border border-slate-300 bg-white px-3 text-slate-700 hover:bg-slate-50 disabled:opacity-70 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
          >
            {locating ? <Spinner /> : <LocateIcon className="text-lg" />}
            <span className="sr-only">{t("search.myLocation")}</span>
          </button>
        </div>
      </div>
      {formMessage ? <Notice tone="warning">{formMessage}</Notice> : null}
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-slate-500 dark:text-slate-400">
        <span>{t("trip.examples")}</span>
        {examples.map(([a, b]) => (
          <button
            key={`${a}-${b}`}
            type="button"
            className="rounded-full bg-slate-100 px-2.5 py-0.5 text-slate-700 hover:bg-brand-50 hover:text-brand-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
            onClick={() => {
              setFrom({ text: a });
              setTo({ text: b });
              void (async () => {
                setBusy(true);
                const rf = await resolve({ text: a });
                setFrom(rf);
                const rt = await resolve({ text: b });
                setTo(rt);
                setBusy(false);
                if (rf.place && rt.place) plan(rf.place, rt.place);
              })();
            }}
          >
            {a} → {b}
          </button>
        ))}
      </p>
    </form>
  );
}
