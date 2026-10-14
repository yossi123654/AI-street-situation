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

Last reviewed: 2026-10-14 (primary pages read and live API calls made). If you find something out of date, please open an
issue or a pull request that updates this file.

> **About this review.** On 2026-10-14 the operators' own policy pages were
> read directly and every keyless service was called live from the app.
> Entries still marked ⚠️ are ones whose primary page could not be read
> (TfL's site blocks automated access) or that need an API key we do not
> hold (TomTom, HERE, Google, Anthropic); their request and response formats
> follow the official documentation and are covered by unit tests. Checking
> one of those against a real key is a welcome contribution.

## Summary

| Area                                    | Source                                   | Default?          | Key needed              | Embed                 | AI analysis | Status            |
| --------------------------------------- | ---------------------------------------- | ----------------- | ----------------------- | --------------------- | ----------- | ----------------- |
| Map (vector)                            | OpenFreeMap                              | Yes               | No                      | Yes, with attribution | n/a         | ✅                |
| Map tiles (raster)                      | OpenStreetMap tile server                | Fallback / opt-in | No                      | Yes, with attribution | n/a         | ✅                |
| Geocoding                               | Nominatim (OSMF public instance)         | Yes               | No                      | n/a                   | n/a         | ✅                |
| Geocoding                               | Photon (komoot public instance)          | Opt-in            | No                      | n/a                   | n/a         | ✅                |
| Geocoding                               | Google Geocoding API                     | Opt-in            | Yes                     | n/a                   | n/a         | ⚠️                |
| Weather                                 | Open-Meteo                               | Yes               | No                      | Yes, with attribution | n/a         | ✅                |
| Parking                                 | OpenStreetMap via Overpass API           | Yes               | No                      | Yes, with attribution | n/a         | ✅                |
| Traffic flow + incidents                | TomTom Traffic API                       | Opt-in            | Yes                     | Per TomTom terms      | n/a         | ⚠️                |
| Traffic flow + incidents                | HERE Traffic API v7                      | Opt-in            | Yes                     | Per HERE terms        | n/a         | ⚠️                |
| Road works (open data)                  | WZDx v4 feeds from road authorities      | Opt-in            | No (feed URL)           | Per feed licence      | n/a         | Per feed          |
| Cameras                                 | TfL JamCams (London)                     | Opt-in            | Yes (free registration) | Yes                   | Yes         | ⚠️ (API ✅)       |
| Cameras                                 | Community registry (`data/cameras`)      | Yes               | No                      | Per camera            | Per camera  | Per entry         |
| Camera                                  | Western Wall live stream (thekotel.org)  | Yes               | No                      | No (terms unknown)    | No          | ✅ link only      |
| AI                                      | Ollama (local open-weight models)        | Opt-in            | No                      | n/a                   | n/a         | ✅ (runs locally) |
| AI                                      | Anthropic API                            | Opt-in            | Yes                     | n/a                   | n/a         | ⚠️                |
| Cameras / incidents / parking occupancy | Israeli government and municipal sources | No                | —                       | —                     | —           | ❌ (see below)    |

## Map

### OpenFreeMap vector map (default)

- Style URL: `https://tiles.openfreemap.org/styles/liberty` (`MAP_STYLE_URL`, `MAP_TYPE=vector`)
- Operator: OpenFreeMap (<https://openfreemap.org>), open source and self-hostable.
- Terms: the public instance is free with no API keys, no registration and
  no limits on map views or requests. It is funded by donations and has no SLA.
- Attribution: "OpenFreeMap © OpenMapTiles Data from OpenStreetMap" is shown
  on the map (`MAP_STYLE_ATTRIBUTION`). Do not remove it.
- Rendering: MapLibre GL JS inside Leaflet (`@maplibre/maplibre-gl-leaflet`).
  MapLibre 6 shapes Hebrew and Arabic labels itself, so no RTL plugin is
  needed. If WebGL is unavailable or the style cannot load, the app falls
  back to the raster tiles below.
- Any other MapLibre-compatible style URL works, including a self-hosted
  OpenFreeMap or a commercial provider.

### OpenStreetMap raster tiles (fallback, or `MAP_TYPE=raster`)

- URL: `https://tile.openstreetmap.org/{z}/{x}/{y}.png` (`MAP_TILE_URL`)
- Operator: OpenStreetMap Foundation (OSMF)
- Terms: OSMF Tile Usage Policy, <https://operations.osmfoundation.org/policies/tiles/>.
  Data © OpenStreetMap contributors, ODbL.
- Embedding: yes. Attribution "© OpenStreetMap contributors" with a link to
  <https://www.openstreetmap.org/copyright> is **required** and shown by default.
- Limits: the public tile server is donation-funded, best-effort, and may
  block heavy use without notice. Requirements as implemented: the exact
  `https://tile.openstreetmap.org/{z}/{x}/{y}.png` URL, visible attribution,
  a Referer header (the app's `Referrer-Policy` is
  `strict-origin-when-cross-origin`, which sends it), no prefetching, and a
  configurable URL. The recommended "Report a map issue" link
  (<https://www.openstreetmap.org/fixthemap>) is in the sources panel.
  Self-hosters expecting real traffic should use OpenFreeMap (the default),
  their own tile server or a commercial provider.

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
  - No autocomplete (explicitly forbidden): searches run only when the user submits.
  - The server can be switched without a software update (`NOMINATIM_URL`).
  - Attribution: "© OpenStreetMap contributors (ODbL)" is shown next to the
    geocoder's name in the sources panel.
  - Usage must be triggered by end users and the number of users moderate;
    the limits apply to the sum of all users of a deployment.
- **The policy addresses LLM-generated code directly.** Code generated by
  LLMs must follow the policy, and the public API must not be built into
  no-code, low-code or "vibe-coding" platforms as a generic geocoding
  service. Use is only permitted where the developer has made a deliberate,
  informed decision and is responsible for compliance. Everyone who deploys
  this project is that developer: read the policy, set `APP_USER_AGENT`, and
  move to your own Nominatim (or Photon / Google) if your traffic is more than
  moderate. The server logs a reminder at startup when the public instance
  is used.
- For heavier use, run your own Nominatim. Self-hosted instances are not throttled.

### Photon (opt-in: `GEOCODING_PROVIDER=photon`)

- URL: `https://photon.komoot.io` (`PHOTON_URL`). Software: <https://github.com/komoot/photon> (Apache-2.0).
- Terms: the public instance is offered for fair use, with no availability
  guarantee, and extensive use is throttled. Run your own instance for
  production loads.
- Languages (confirmed against the live API): `default`, `de`, `en`, `fr`.
  For Hebrew the app sends `default`, which returns local (Hebrew) names.

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
  Non-commercial means, for example, private or non-profit sites without
  subscriptions or advertising. A deployment with ads or subscriptions is
  commercial and needs an API plan (`OPEN_METEO_URL` supports the customer
  endpoint or a self-hosted instance).
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

### Open road-work feeds: WZDx (`WZDX_FEED_URLS`)

- Standard: Work Zone Data Exchange v4, an open GeoJSON specification
  maintained by the US Department of Transportation
  (<https://github.com/usdot-jpo-ode/wzdx>). Many US state and city road
  authorities publish WZDx feeds of road works and detours.
- Configure one or more feed URLs, comma-separated. Each feed's
  `feed_info.publisher` is shown as the source and `feed_info.license` is
  linked. Check each feed's licence before enabling it.
- Only events that are active now (between `start_date` and `end_date`) and
  within 2 km of the selected point are shown. Feeds are cached for 5 minutes.
- Incidents from WZDx are merged with TomTom or HERE incidents.
- No Israeli authority is known to publish WZDx today. Any authority that
  starts publishing road works in this format works with no code changes.

## Parking

### OpenStreetMap via the Overpass API (default)

- Endpoints (`OVERPASS_URLS`, tried in order, from the OSM wiki's list of
  public instances):
  1. VK Maps, `https://maps.mail.ru/osm/tools/overpass/api/interpreter`:
     "Feel free to use our services in any project. There are currently no
     requests limitations."
  2. Private.coffee, `https://overpass.private.coffee/api/interpreter`:
     "Feel free to use our service in any project, there is no rate limit in
     place. Please notify us in advance if you intend to use our service in a
     large scale project."
  3. Main instance (FOSSGIS), `https://overpass-api.de/api/interpreter`, last
     because it is overloaded and asks apps in regular use to stay under
     about 100 queries and 10 MB per day across all users.
- After an error an instance is skipped for 30 seconds (the main
  instance's policy asks clients to pause 30 s after a 429/406).
- In testing on 2026-10-14 all three public instances were intermittently
  slow or failing. Successful queries took 2-20 s. The app therefore also
  serves the last good result for an area (up to 7 days old) when every
  instance fails. Software is open source and self-hostable.
- Data: OSM features tagged `amenity=parking` near the selected point: name,
  type (surface, underground, multi-storey, street-side), capacity, accessible
  spaces, fee, access, opening hours, operator, maximum stay, park & ride.
  Facilities tagged `access=private` or `access=no` are hidden. Data ©
  OpenStreetMap contributors, ODbL (attribution shown).
- **No live occupancy.** OSM describes where parking is, not how full it is.
  The UI and the AI summary say so explicitly.
- Commercial use should use a self-hosted or paid instance (main instance
  policy). The app sends at most one request at a time to public instances,
  identifies itself with `APP_USER_AGENT`, and caches results for 12 hours
  per ~100 m grid cell and radius.
- Data quality varies by city: in central London most car parks have names
  and fee tags; in Jerusalem many are mapped without a name, fee or capacity,
  and the app shows them as "unnamed" with unknown fees.
- Navigation links (Waze, Google Maps, OpenStreetMap) are plain links that
  the user opens. No data is sent to those services unless the user clicks.

### Live parking occupancy (❌ not included yet)

- **Ahuzot HaHof (Tel Aviv-Yafo)**: operates the city's public car parks
  with computerised entry, but we found no published occupancy feed or terms.
- **Other Israeli municipalities and data.gov.il**: no real-time parking
  occupancy dataset with clear terms was identified.
- The `ParkingFacility.occupancy` field and the provider interface are ready
  for a live source. If you know one with published terms, please open an issue.

## Cameras

### Community registry (default)

Cameras contributed by pull request in `data/cameras/<country>/<city>.json`.
Every entry records its operator, licence, terms URL and three permissions
(`embedAllowed`, `aiAnalysisAllowed`, `commercialUseAllowed`). See
[adding-a-camera.md](adding-a-camera.md).

**Current state:** one Israeli entry, the Western Wall live stream, as an
external link only (see below). No Israeli source with terms that allow
embedding or AI analysis has been found yet. We would rather ship few
cameras than cameras whose terms we cannot show.

### TfL JamCams, London (`TFL_APP_KEY`)

- API: `https://api.tfl.gov.uk/Place/Type/JamCam` (TfL Unified API).
  Verified live on 2026-10-14: 890 cameras, each with `imageUrl` (JPEG with a
  `Last-Modified` header), `videoUrl` (MP4) on
  `s3-eu-west-1.amazonaws.com/jamcams.tfl.gov.uk/`, plus `available` and
  `view` properties.
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
- The image proxy only fetches TfL media from the
  `s3-eu-west-1.amazonaws.com/jamcams.tfl.gov.uk/` prefix (TfL's bucket, not
  the whole S3 host) and `jamcams.tfl.gov.uk`.
- The terms page could not be re-read on 2026-10-14 because tfl.gov.uk blocks
  automated browsers; the summary above comes from earlier search results.

### Israeli sources (❌ not included yet)

- **Netivei Israel / Ayalon Highways traffic cameras**: we found no
  published terms of use for reuse, embedding or AI analysis.
- **Municipal cameras** (for example Tel Aviv-Yafo's beach live stream,
  described in 2016 press coverage): we could not confirm a current URL or
  any terms of use.
- **Western Wall cameras** (Western Wall Heritage Foundation): the official
  page <https://thekotel.org/he/kotel/kotel_cameras/> embeds a live player and
  a YouTube playlist. No reuse terms are published, so it is in the registry
  as an **external link only** (`il-jerusalem-western-wall-plaza`).
- **Tel Aviv-Yafo municipality**: its "cameras" page
  (`/Residents/Transportation/Pages/TrafficCameras.aspx`) is about
  enforcement cameras, not live feeds.
- **Netivei Israel (iroads.co.il) and the Jerusalem municipality**: their sites
  returned HTTP 403 to automated access on 2026-10-14, so no live camera feed
  or terms could be checked.
- **data.gov.il and municipal open-data portals**: no real-time traffic
  incident, road-closure or camera dataset with clear terms was identified.
  data.gov.il runs CKAN, so a future provider could use its `datastore_search`
  API if such a dataset appears.
- **Waze for Cities (Waze data feed)**: real-time incidents and closures, but
  available only to partner organisations under a data-sharing agreement, so
  it cannot be a default for a public open-source app.

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
