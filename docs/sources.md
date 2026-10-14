# Data sources

This file documents every external source the app can use: who runs it, its
terms, whether we may embed it or send its images to an AI model, and its rate
limits. **A source whose terms are unclear is not enabled by default.**

Status legend:

- ✅ **Verified**: terms checked against the operator's published policy.
- ⚠️ **Partially verified**: key facts confirmed through secondary sources
  (developer forums, official client libraries); re-check the primary page
  before relying on it commercially.
- ❌ **Not included**: investigated and left out. The reason is given.

Last reviewed: 2026-10-14. If you find something out of date, please open an
issue or a pull request that updates this file.

> **About this review.** It was done from a sandbox that could not open most
> operator websites directly, so several entries rely on search results that
> quote the official pages. Those entries are marked ⚠️. Updating an entry to ✅
> after reading the primary source is a welcome first contribution.

## Summary

| Area                     | Source                                   | Default? | Key needed              | Embed                 | AI analysis | Status            |
| ------------------------ | ---------------------------------------- | -------- | ----------------------- | --------------------- | ----------- | ----------------- |
| Map tiles                | OpenStreetMap tile server                | Yes      | No                      | Yes, with attribution | n/a         | ⚠️                |
| Geocoding                | Nominatim (OSMF public instance)         | Yes      | No                      | n/a                   | n/a         | ⚠️                |
| Geocoding                | Photon (komoot public instance)          | Opt-in   | No                      | n/a                   | n/a         | ⚠️                |
| Geocoding                | Google Geocoding API                     | Opt-in   | Yes                     | n/a                   | n/a         | ⚠️                |
| Weather                  | Open-Meteo                               | Yes      | No                      | Yes, with attribution | n/a         | ⚠️                |
| Traffic flow + incidents | TomTom Traffic API                       | Opt-in   | Yes                     | Per TomTom terms      | n/a         | ⚠️                |
| Traffic flow + incidents | HERE Traffic API v7                      | Opt-in   | Yes                     | Per HERE terms        | n/a         | ⚠️                |
| Cameras                  | TfL JamCams (London)                     | Opt-in   | Yes (free registration) | Yes                   | Yes         | ⚠️                |
| Cameras                  | Community registry (`data/cameras`)      | Yes      | No                      | Per camera            | Per camera  | Per entry         |
| AI                       | Ollama (local open-weight models)        | Opt-in   | No                      | n/a                   | n/a         | ✅ (runs locally) |
| AI                       | Anthropic API                            | Opt-in   | Yes                     | n/a                   | n/a         | ⚠️                |
| Cameras / incidents      | Israeli government and municipal sources | No       | —                       | —                     | —           | ❌ (see below)    |

## Map tiles

### OpenStreetMap tile server (default)

- URL: `https://tile.openstreetmap.org/{z}/{x}/{y}.png` (`MAP_TILE_URL`)
- Operator: OpenStreetMap Foundation (OSMF)
- Terms: OSMF Tile Usage Policy, <https://operations.osmfoundation.org/policies/tiles/>.
  Data © OpenStreetMap contributors, ODbL.
- Embedding: yes. Attribution "© OpenStreetMap contributors" with a link to
  <https://www.openstreetmap.org/copyright> is **required** and shown by default.
- Limits: the public tile server is donation-funded and meant for light use.
  Heavy use is forbidden and can be blocked. Self-hosters expecting real
  traffic should switch `MAP_TILE_URL` to a commercial tile provider or their
  own tile server.
- Note on OpenFreeMap: OpenFreeMap (<https://openfreemap.org>) is free with no
  keys, but it serves **vector** tiles only (no raster tiles). Leaflet needs a
  plugin to render them, so it is not wired in yet. Contributions welcome.

## Geocoding

### Nominatim (default)

- URL: `https://nominatim.openstreetmap.org` (`NOMINATIM_URL`)
- Operator: OSMF. Software: <https://nominatim.org> (GPL-2.0, self-hostable).
- Terms: Nominatim Usage Policy, <https://operations.osmfoundation.org/policies/nominatim/>.
- Requirements as implemented:
  - An **absolute maximum of 1 request per second** for the whole application.
    The app serialises requests to the public instance with ≥1.1 s spacing.
  - An identifying **User-Agent** (`APP_USER_AGENT`); stock library agents are
    rejected. Optional contact email (`NOMINATIM_EMAIL`).
  - **Results are cached** (24 h, in memory).
  - No autocomplete: searches run only when the user submits.
  - Attribution: data © OpenStreetMap contributors (ODbL).
- For heavier use, run your own Nominatim. Self-hosted instances are not throttled.

### Photon (opt-in: `GEOCODING_PROVIDER=photon`)

- URL: `https://photon.komoot.io` (`PHOTON_URL`). Software: <https://github.com/komoot/photon> (Apache-2.0).
- Terms: the public instance is offered for fair use, with no availability
  guarantee, and extensive use is throttled. Run your own instance for
  production loads.
- Language support is limited (English, German, French, plus local names), so
  Hebrew queries return local names.

### Google Geocoding API (opt-in: `GEOCODING_PROVIDER=google` + `GOOGLE_MAPS_API_KEY`)

- Docs: <https://developers.google.com/maps/documentation/geocoding>
- Commercial, billed per request, needs a key. Generally better Hebrew address coverage.
- The Google Maps Platform terms restrict caching and use of results with
  non-Google maps. Review them before enabling this on a public deployment.

## Weather

### Open-Meteo (default)

- URL: `https://api.open-meteo.com/v1/forecast` (`OPEN_METEO_URL`)
- Operator: Open-Meteo. Software is open source (AGPL-3.0) and self-hostable.
- Terms: <https://open-meteo.com/en/terms>. The free API is for
  **non-commercial use** under **10,000 calls/day, 5,000/hour and 600/minute**.
  Commercial use needs a subscription.
- Data licence: **CC BY 4.0**. Attribution "Weather data by Open-Meteo.com"
  next to the data is required. It is shown on the weather card's source list.
- Caching: 10 minutes per ~100 m grid cell.

## Traffic and incidents (bring your own key)

No free, open, global real-time traffic source exists, so traffic is off by
default and the UI says so.

### TomTom Traffic API (`TOMTOM_API_KEY`)

- Docs: <https://developer.tomtom.com/traffic-api/documentation>
- Endpoints used: Flow Segment Data
  (`/traffic/services/4/flowSegmentData/absolute/10/json`) and Incident
  Details v5 (`/traffic/services/5/incidentDetails`, bbox + `fields` filter).
- Commercial terms with a free evaluation tier. Display rules and caching
  limits are set by TomTom's terms. Attribution "© TomTom" is shown.

### HERE Traffic API v7 (`HERE_API_KEY`)

- Docs: <https://www.here.com/docs/bundle/traffic-api-developer-guide-v7/page/README.html>
- Endpoints used: `https://data.traffic.hereapi.com/v7/flow` and `/v7/incidents`
  with `in=circle:lat,lon;r=metres`.
- Commercial terms with a free tier. Attribution "© HERE" is shown.

## Cameras

### Community registry (default)

Cameras contributed by pull request in `data/cameras/<country>/<city>.json`.
Every entry records its operator, licence, terms URL and three permissions
(`embedAllowed`, `aiAnalysisAllowed`, `commercialUseAllowed`). See
[adding-a-camera.md](adding-a-camera.md).

**Current state: the registry is empty.** No Israeli camera source has been
verified yet (see below). We would rather ship no cameras than cameras whose
terms we cannot show.

### TfL JamCams, London (`TFL_APP_KEY`)

- API: `https://api.tfl.gov.uk/Place/Type/JamCam` (TfL Unified API). Each
  camera has `imageUrl` (JPEG, about every 5 minutes) and `videoUrl` (short
  MP4 clip) on TfL's S3 bucket, plus an `available` flag.
- Operator: Transport for London.
- Terms: TfL Transport Data Service terms,
  <https://tfl.gov.uk/corporate/terms-and-conditions/transport-data-service>.
  Based on the **Open Government Licence v2.0**, with TfL amendments:
  registration for an app key is required, API call limits apply, and you
  must not imply your product is an official TfL product.
- Attribution: **"Powered by TfL Open Data"** (shown with every camera).
- Our permission mapping: `embedAllowed: true` and `aiAnalysisAllowed: true`
  (OGL allows copying, publishing and adapting the information);
  `commercialUseAllowed: "unknown"` (OGL allows it, but we have not reviewed
  TfL's amendments in full).
- The image proxy only fetches TfL media from `s3-eu-west-1.amazonaws.com`
  and `jamcams.tfl.gov.uk`.

### Israeli sources (❌ not included yet)

- **Netivei Israel / Ayalon Highways traffic cameras**: we found no
  published terms of use for reuse, embedding or AI analysis.
- **Municipal cameras** (for example Tel Aviv-Yafo's beach live stream,
  described in 2016 press coverage): we could not confirm a current URL or
  any terms of use.
- **Western Wall cameras** (Western Wall Heritage Foundation, thekotel.org):
  public live streams exist, but we found no published reuse terms.
- **data.gov.il and municipal open-data portals**: no real-time traffic
  incident or camera dataset with clear terms was identified.

If you can document terms for any of these, add the camera with
`"unknown"` permissions (shown as an external link only) or with explicit
permissions backed by a link to the terms. See
[adding-a-camera.md](adding-a-camera.md).

## AI

### Ollama (`OLLAMA_URL`)

- <https://ollama.com>. Runs open-weight vision models locally (for example
  `qwen2.5vl:7b` or `llava`). No data leaves your server. Model licences vary;
  check the licence of the model you pull.

### Anthropic API (`ANTHROPIC_API_KEY`)

- <https://docs.anthropic.com>. Images and report facts are sent to Anthropic
  for processing under Anthropic's commercial terms. Only cameras with
  `aiAnalysisAllowed: true` are ever sent.

## Rules that apply to every source

- The server fetches camera images only from URLs in the registry or from an
  allowlisted provider host. User-supplied URLs are never fetched.
- Camera images are held in memory for at most one refresh interval (max
  5 minutes) and are never written to disk.
- No face recognition, licence-plate recognition or tracking of people. The
  AI prompts forbid it and describe people and vehicles only in aggregate.
