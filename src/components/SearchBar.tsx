"use client";

import { useId, useState, type FormEvent } from "react";
import { LocateIcon, PinIcon, SearchIcon } from "@/components/icons";
import { Notice, Spinner } from "@/components/ui";
import { useI18n } from "@/i18n/I18nProvider";
import { apiGet } from "@/lib/apiClient";
import type { Place } from "@/lib/types";

type State =
  | { status: "idle" }
  | { status: "searching" }
  | { status: "choose"; places: Place[] }
  | { status: "empty"; query: string }
  | { status: "error"; message: string };

export function SearchBar({
  onSelect,
  onLocate,
}: {
  onSelect: (place: Place) => void;
  onLocate: (point: { lat: number; lon: number }) => void;
}) {
  const { t, locale } = useI18n();
  const [query, setQuery] = useState("");
  const [state, setState] = useState<State>({ status: "idle" });
  const [locating, setLocating] = useState(false);
  const inputId = useId();

  // Searches run on submit only: the public Nominatim instance forbids autocomplete.
  const search = async (text: string) => {
    const q = text.trim();
    if (q.length < 2) {
      setState({ status: "error", message: t("search.tooShort") });
      return;
    }
    setState({ status: "searching" });
    try {
      const { places } = await apiGet<{ places: Place[] }>(
        `/api/geocode?q=${encodeURIComponent(q)}&lang=${locale}`,
      );
      if (places.length === 0) setState({ status: "empty", query: q });
      else if (places.length === 1) {
        setState({ status: "idle" });
        onSelect(places[0]!);
      } else setState({ status: "choose", places });
    } catch {
      setState({ status: "error", message: t("search.error") });
    }
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    void search(query);
  };

  const locate = () => {
    if (!("geolocation" in navigator)) {
      setState({ status: "error", message: t("search.geolocationError") });
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocating(false);
        setState({ status: "idle" });
        onLocate({ lat: position.coords.latitude, lon: position.coords.longitude });
      },
      () => {
        setLocating(false);
        setState({ status: "error", message: t("search.geolocationError") });
      },
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 60_000 },
    );
  };

  const examples = [t("search.example1"), t("search.example2"), t("search.example3")];

  return (
    <div className="space-y-2">
      <form onSubmit={submit} role="search" className="flex flex-col gap-2 sm:flex-row">
        <label htmlFor={inputId} className="sr-only">
          {t("search.label")}
        </label>
        <div className="relative flex-1">
          <SearchIcon className="pointer-events-none absolute start-3.5 top-1/2 -translate-y-1/2 text-lg text-slate-400" />
          <input
            id={inputId}
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("search.placeholder")}
            autoComplete="off"
            enterKeyHint="search"
            maxLength={200}
            className="h-12 w-full rounded-xl border border-slate-300 bg-white ps-11 pe-4 text-base shadow-sm placeholder:text-slate-400 focus:border-brand-500 focus:ring-4 focus:ring-brand-100 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:focus:ring-brand-900"
            data-testid="search-input"
          />
        </div>
        <div className="flex gap-2">
          <button
            type="submit"
            disabled={state.status === "searching"}
            className="inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-brand-600 px-6 font-semibold text-white shadow-sm hover:bg-brand-700 disabled:opacity-70 sm:flex-none"
            data-testid="search-submit"
          >
            {state.status === "searching" ? <Spinner /> : <SearchIcon />}
            {state.status === "searching" ? t("search.searching") : t("search.submit")}
          </button>
          <button
            type="button"
            onClick={locate}
            disabled={locating}
            className="inline-flex h-12 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-70 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
            title={t("search.myLocation")}
          >
            {locating ? <Spinner /> : <LocateIcon className="text-lg" />}
            <span className="hidden md:inline">
              {locating ? t("search.locating") : t("search.myLocation")}
            </span>
            <span className="sr-only md:hidden">{t("search.myLocation")}</span>
          </button>
        </div>
      </form>

      {state.status === "idle" || state.status === "searching" ? (
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-slate-500 dark:text-slate-400">
          <span>{t("search.examples")}</span>
          {examples.map((example) => (
            <button
              key={example}
              type="button"
              className="rounded-full bg-slate-100 px-2.5 py-0.5 text-slate-700 hover:bg-brand-50 hover:text-brand-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
              onClick={() => {
                setQuery(example);
                void search(example);
              }}
            >
              {example}
            </button>
          ))}
        </p>
      ) : null}

      {state.status === "choose" ? (
        <div className="rounded-xl border border-slate-200 bg-white p-2 shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <p className="px-2 pt-1 pb-2 text-sm text-slate-500">{t("search.chooseResult")}</p>
          <ul
            className="divide-y divide-slate-100 dark:divide-slate-800"
            data-testid="search-results"
          >
            {state.places.map((place) => (
              <li key={place.id}>
                <button
                  type="button"
                  className="flex w-full items-start gap-2 rounded-lg px-2 py-2 text-start hover:bg-slate-50 dark:hover:bg-slate-800"
                  onClick={() => {
                    setState({ status: "idle" });
                    onSelect(place);
                  }}
                >
                  <PinIcon className="mt-0.5 shrink-0 text-brand-600" />
                  <span className="text-sm">{place.label}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {state.status === "empty" ? (
        <Notice>{t("search.noResults", { query: state.query })}</Notice>
      ) : null}
      {state.status === "error" ? <Notice tone="warning">{state.message}</Notice> : null}
    </div>
  );
}
