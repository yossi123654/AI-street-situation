import type { Locale } from "@/lib/types";
import en from "@/i18n/messages/en.json";
import he from "@/i18n/messages/he.json";

/**
 * To add a language: add its code to `Locale` in src/lib/types.ts, create
 * src/i18n/messages/<code>.json with the same keys as en.json, and register it
 * below. `npm test` fails if any key is missing.
 */
export type Messages = typeof en;

export const LOCALES: Record<Locale, { label: string; dir: "rtl" | "ltr"; messages: Messages }> = {
  he: { label: "עברית", dir: "rtl", messages: he },
  en: { label: "English", dir: "ltr", messages: en },
};

export const DEFAULT_LOCALE: Locale = "he";
export const LOCALE_COOKIE = "locale";

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && value in LOCALES;
}

type Join<K, P> = K extends string ? (P extends string ? `${K}.${P}` : never) : never;
type Paths<T> = T extends string
  ? never
  : { [K in keyof T]: T[K] extends string ? K & string : Join<K, Paths<T[K]>> }[keyof T];

export type MessageKey = Paths<Messages>;

export function translate(
  messages: Messages,
  key: MessageKey,
  vars?: Record<string, string | number>,
): string {
  let value: unknown = messages;
  for (const part of key.split(".")) value = (value as Record<string, unknown> | undefined)?.[part];
  if (typeof value !== "string") return key;
  if (!vars) return value;
  return value.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in vars ? String(vars[name]) : match,
  );
}
