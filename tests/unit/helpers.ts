import { vi } from "vitest";
import { resetConfigForTests } from "@/lib/config";
import { resetProvidersForTests } from "@/providers/registry";

/** Replaces the process environment for the duration of a test. */
export function withEnv(env: Record<string, string>) {
  const keys = Object.keys(env);
  const previous = Object.fromEntries(keys.map((k) => [k, process.env[k]]));
  Object.assign(process.env, env);
  resetConfigForTests();
  resetProvidersForTests();
  return () => {
    for (const k of keys) {
      if (previous[k] === undefined) delete process.env[k];
      else process.env[k] = previous[k];
    }
    resetConfigForTests();
    resetProvidersForTests();
  };
}

/** Mocks global fetch with a handler; returns the mock for assertions. */
export function mockFetch(handler: (url: URL, init?: RequestInit) => Response | Promise<Response>) {
  const fn = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(
      typeof input === "string" ? input : input instanceof URL ? input.href : input.url,
    );
    return handler(url, init);
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}

export const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
