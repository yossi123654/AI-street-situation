# Security policy

## Reporting a vulnerability

Please **do not open a public issue** for security problems.

Report vulnerabilities privately through GitHub's
[private vulnerability reporting](https://github.com/yossi123654/ai-street-situation/security/advisories/new)
("Report a vulnerability" on the repository's Security tab). Include steps to
reproduce, the affected version or commit, and the impact you expect.

You can expect an acknowledgement within 7 days. We will keep you informed
while we work on a fix and credit you in the release notes unless you prefer
otherwise.

## Supported versions

The project is pre-1.0. Security fixes are made on the `main` branch.

## Scope and design notes

Things we especially want to hear about:

- **SSRF**: the server must only fetch camera media from URLs in the camera
  registry or allowlisted provider hosts, never from user input
  (`src/services/CameraImageService.ts`, `src/lib/urlSafety.ts`).
- **Secret exposure**: API keys must never reach the browser, logs or API
  responses.
- **Injection** through camera registry data or upstream responses (XSS in
  the UI, prompt injection that makes the AI identify people or invent
  facts).
- **Rate-limit bypass** that could get a deployment banned by an upstream
  provider.

Known limitations, documented on purpose:

- Rate limiting is in-memory and per instance. Without a trusted reverse
  proxy, a client can forge `X-Forwarded-For` and escape its per-client
  bucket; the global limit (`GLOBAL_RATE_LIMIT_PER_MINUTE`) still caps total
  load. Behind a reverse proxy, set `TRUST_PROXY=true`: the proxy-added (last)
  `X-Forwarded-For` entry or `X-Real-IP` is used, never the client-supplied
  first entry.
- Calls to rate-limited public services (Nominatim, OSRM, Overpass) wait in
  bounded queues; when a queue is full the API answers 503 at once instead
  of queueing without limit.
- AI summaries are cached and shared by location, so the place names in AI
  prompts come from the geocoder, never from request parameters such as
  `label`; trip reports likewise never share one user's labels with another.
- Camera registry entries are reviewed by people. The validator rejects
  non-https URLs and IP literals, and the server rejects private addresses at
  runtime, but a hostname that resolves to a private address is only caught
  by review. Run the app in a network that cannot reach sensitive internal
  services.
