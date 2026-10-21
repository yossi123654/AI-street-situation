import { isIP } from "node:net";

const PRIVATE_V4 = [
  /^0\./,
  /^10\./,
  /^127\./,
  /^169\.254\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^192\.168\./,
  /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./,
];

function isPrivateHost(hostname: string): boolean {
  const host = hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".internal"))
    return true;
  const ipVersion = isIP(host);
  if (ipVersion === 4) return PRIVATE_V4.some((re) => re.test(host));
  if (ipVersion === 6) {
    return (
      host === "::1" ||
      host === "::" ||
      /^f[cd]/.test(host) ||
      /^fe80/.test(host) ||
      host.startsWith("::ffff:")
    );
  }
  return false;
}

/**
 * Checks a media URL taken from the camera registry before the server fetches
 * it. This is defence in depth: the server never fetches user-supplied URLs,
 * only URLs from the registry, and this additionally rejects non-https URLs,
 * IP literals in private ranges and URLs outside an optional allowlist.
 */
export function assertSafeMediaUrl(
  raw: string,
  options: { allowInsecure: boolean; allowedHosts?: string[]; expectedHost?: string },
): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("invalid media URL");
  }
  if (options.allowInsecure) {
    if (url.protocol !== "https:" && url.protocol !== "http:")
      throw new Error("unsupported protocol");
    return url;
  }
  if (url.protocol !== "https:") throw new Error("media URL must use https");
  if (url.username || url.password) throw new Error("credentials in media URL are not allowed");
  if (isPrivateHost(url.hostname)) throw new Error("media URL points to a private address");
  const allowed = [
    ...(options.allowedHosts ?? []),
    ...(options.expectedHost ? [options.expectedHost] : []),
  ];
  if (allowed.length > 0 && !allowed.some((entry) => matchesAllowEntry(url, entry))) {
    throw new Error(`media URL ${url.hostname}${url.pathname} is not allowlisted`);
  }
  return url;
}

/**
 * An allowlist entry is a hostname ("tfl.gov.uk", which also matches
 * subdomains) or a hostname plus path prefix ("s3-eu-west-1.amazonaws.com/jamcams.tfl.gov.uk/"),
 * for shared hosts such as S3 where the host alone would admit any bucket.
 */
function matchesAllowEntry(url: URL, entry: string): boolean {
  const slash = entry.indexOf("/");
  const host = (slash === -1 ? entry : entry.slice(0, slash)).toLowerCase();
  const pathPrefix = slash === -1 ? "" : entry.slice(slash);
  const hostname = url.hostname.toLowerCase();
  if (pathPrefix) return hostname === host && url.pathname.startsWith(pathPrefix);
  return hostname === host || hostname.endsWith(`.${host}`);
}
