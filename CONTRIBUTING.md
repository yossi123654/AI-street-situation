# Contributing

Thanks for helping! This project aims to be small, reliable and easy to
self-host. Please read this page before opening a pull request.

By participating you agree to follow the [Code of Conduct](CODE_OF_CONDUCT.md).

## Ways to help

- **Add a camera or a camera source.** Read [docs/adding-a-camera.md](docs/adding-a-camera.md).
  Verified Israeli sources are especially welcome.
- **Add a data provider** (traffic, incidents, weather, geocoding, AI). Read
  [docs/adding-a-provider.md](docs/adding-a-provider.md).
- **Verify a source** in [docs/sources.md](docs/sources.md) against its
  primary terms page and update its status.
- **Translate** the UI: copy `src/i18n/messages/en.json` to a new language
  file and register it in `src/i18n/config.ts` (and `Locale` in `src/lib/types.ts`).
- **Report bugs** and suggest features through GitHub issues.

## Development setup

```bash
npm install
npm run dev          # http://localhost:3000, works without any API key
```

Before pushing:

```bash
npm run format       # Prettier
npm run check        # ESLint + TypeScript + camera validation + unit tests
npm run build && npm run test:e2e   # end-to-end tests (needs Playwright's Chromium:
                                    # npx playwright install chromium)
```

CI runs the same steps on every pull request, plus a Docker build.

## Guidelines

- **Keep providers swappable.** UI and services never call upstream APIs
  directly. Everything goes through a provider in `src/providers`.
- **Never present missing or stale data as fact.** Use `null` for unknown
  values, set `observedAt`, and let the freshness rules do their job.
- **Respect upstream terms.** Rate limits, attribution and caching rules
  belong in the code, not only in the docs.
- **No secrets in the repository**, in logs, or in anything sent to the
  browser. Configuration goes through environment variables and is
  documented in `.env.example`.
- **Privacy first.** No analytics, no tracking, no storing images. AI features
  must never identify people or licence plates.
- **i18n.** Every user-visible string goes in all files under
  `src/i18n/messages/` (a unit test checks they stay in sync).
- **Tests.** New providers and services need unit tests with mocked `fetch`.
  UI changes should keep the end-to-end tests passing.
- Keep pull requests focused. One provider or one feature per PR is easiest
  to review.

## Commit messages

Use short, imperative subjects, e.g. `Add HERE incidents provider` or
`Fix stale badge for undated camera images`.

## Licensing

By contributing you agree that your contributions are licensed under the
[MIT License](LICENSE). Do not submit code, data or images you do not have
the right to share. Camera images are never committed, only metadata.
