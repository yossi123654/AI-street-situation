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

| Area                                    | Source                                       | Default?          | Key needed              | Embed                      | AI analysis | Status            |
| --------------------------------------- | -------------------------------------------- | ----------------- | ----------------------- | -------------------------- | ----------- | ----------------- |
| Map (vector)                            | OpenFreeMap                                  | Yes               | No                      | Yes, with attribution      | n/a         | ✅                |
| Map tiles (raster)                      | OpenStreetMap tile server                    | Fallback / opt-in | No                      | Yes, with attribution      | n/a         | ✅                |
| Geocoding                               | Nominatim (OSMF public instance)             | Yes               | No                      | n/a                        | n/a         | ✅                |
| Geocoding                               | Photon (komoot public instance)              | Opt-in            | No                      | n/a                        | n/a         | ✅                |
| Geocoding                               | Google Geocoding API                         | Opt-in            | Yes                     | n/a                        | n/a         | ⚠️                |
| Weather                                 | Open-Meteo                                   | Yes               | No                      | Yes, with attribution      | n/a         | ✅                |
| Parking                                 | OpenStreetMap via Overpass API               | Yes               | No                      | Yes, with attribution      | n/a         | ✅                |
| Traffic flow + incidents                | TomTom Traffic API                           | Opt-in            | Yes                     | Per TomTom terms           | n/a         | ⚠️                |
| Traffic flow + incidents                | HERE Traffic API v7                          | Opt-in            | Yes                     | Per HERE terms             | n/a         | ⚠️                |
| Road works (open data)                  | WZDx v4 feeds from road authorities          | Opt-in            | No (feed URL)           | Per feed licence           | n/a         | Per feed          |
| Cameras                                 | TfL JamCams (London)                         | Opt-in            | Yes (free registration) | Yes                        | Yes         | ⚠️ (API ✅)       |
| Cameras                                 | Community registry (`data/cameras`)          | Yes               | No                      | Per camera                 | Per camera  | Per entry         |
| Cameras                                 | Fintraffic road weather cameras (Finland)    | Yes               | No                      | Yes (CC BY 4.0)            | Yes         | ✅                |
| Cameras                                 | LTA traffic cameras, data.gov.sg (Singapore) | Yes               | No                      | Yes (SG Open Data Licence) | Yes         | ✅                |
| Cameras                                 | Transport Department snapshots (Hong Kong)   | Opt-in            | No                      | Yes (DATA.GOV.HK terms)    | Yes         | ✅ (indemnity)    |
| Camera                                  | Western Wall live stream (thekotel.org)      | Yes               | No                      | No (terms unknown)         | No          | ✅ link only      |
| AI                                      | Ollama (local open-weight models)            | Opt-in            | No                      | n/a                        | n/a         | ✅ (runs locally) |
| AI                                      | Anthropic API                                | Opt-in            | Yes                     | n/a                        | n/a         | ⚠️                |
| Photos (street level)                   | Panoramax                                    | Yes               | No                      | Yes (CC BY-SA 4.0 mostly)  | No          | ✅                |
| Photos (geotagged)                      | Wikimedia Commons                            | Yes               | No                      | Yes (licence per photo)    | No          | ✅                |
| Photos (street level)                   | Mapillary                                    | No                | Yes                     | Logo + link required       | —           | ❌ (see below)    |
| Cameras / incidents / parking occupancy | Israeli government and municipal sources     | No                | —                       | —                          | —           | ❌ (see below)    |

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

### Hebrew addresses (all geocoders)

OSM geocoders know Israeli streets, but not how people type them. Measured
against Nominatim on 2026-10-22: "רחוב יפו 23 ירושלים", "רח' הרצל 10 תל אביב"
and "רחוב הנביאים, ירושלים" found nothing, and "שד' רוטשילד 1 ת"א", "בן יהודה
5 י-ם" and "ז׳בוטינסקי 7 ר"ג" were matched to streets in the wrong city. The
app therefore rewrites Hebrew queries before geocoding
(`src/lib/hebrewQuery.ts`):

- drops the "רחוב / רח'" prefix and expands "שד'", "סמ'" and "כ"כ";
- expands city abbreviations (ת"א, י-ם, ב"ש, פ"ת, ר"ג, ראשל"צ, כ"ס, ב"ב…);
- unifies Hebrew and typographic quote marks (״ ׳ “ ”);
- tries the rewritten query, then the original text, then the street
  without the house number (at most three upstream calls, cached for a day);
- when the query names a city, drops results in other towns (ignoring
  district names such as "נפת פתח תקווה"), so a wrong match is reported as
  "no results" rather than shown as the answer.

With these rules all the queries above find the right place.

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

### Prebuilt OpenStreetMap extract (default inside Israel)

- `data/osm/il.json.gz`: car parks, fuel stations, EV chargers, rest areas
  and motorway services in Israel and the Palestinian territories (the bbox
  of the Geofabrik / openstreetmap.fr extract), with only the tags the app
  reads: 15,751 features in 246 KB on 2026-10-22 (13,937 car parks, 1,503
  fuel stations, 192 EV chargers, 118 rest areas and services). Built with
  `npm run osm:extract` from the `.osm.pbf` extract using `osmium`, and
  refreshed weekly by a GitHub Actions workflow that opens a pull request.
- Parking and "stops along the route" queries that fall entirely inside the
  extract's outline are answered from memory: no network call, no load on public
  Overpass servers, and no failures when they are overloaded (which happened
  often during development). Searches elsewhere use Overpass as below.
- Freshness: the extract records the OSM data timestamp, shown as the source
  time. Weekly is plenty for car parks and fuel stations.
- Licence: the files are © OpenStreetMap contributors under the **ODbL**,
  not the project's MIT licence (see `data/osm/README.md`).
- Switch off with `OSM_EXTRACT_ENABLED=false`; add regions in
  `data/osm/regions.json`.

### OpenStreetMap via the Overpass API (everywhere else)

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

## Routing (trips)

### OSRM on routing.openstreetmap.de (default)

- URL: `https://routing.openstreetmap.de/routed-car` (`OSRM_URL`). Software:
  OSRM (<https://project-osrm.org>, BSD-2-Clause), self-hostable.
- Operator: FOSSGIS e.V., the same server that powers directions on
  openstreetmap.org. Data © OpenStreetMap contributors (ODbL), updated about
  every two days.
- Terms (<https://routing.openstreetmap.de/about.html>, read 2026-10-20):
  show attribution and a "fix the map" link, send a valid User-Agent,
  **at most one request per second**, no scraping or heavy usage.
  Implemented: attribution and the fix-the-map link appear in the trip
  overview, requests are throttled to one per second per server, routes are
  cached for 30 minutes.
- Travel times are free-flow estimates. OSRM has no live or predicted
  traffic, and the UI says so next to every OSRM travel time, including for
  later departures.
- Verified live: Jerusalem → Tel Aviv, 66 km, 59 min, with Hebrew road names.

### TomTom Routing API (`TOMTOM_API_KEY`)

- Docs: <https://developer.tomtom.com/routing-api/documentation/tomtom-maps/calculate-route>
- Endpoint used: `routing/1/calculateRoute/{lat,lon:lat,lon}/json` with
  `traffic=true`, `sectionType=traffic`, `computeTravelTimeFor=all` and text
  instructions. The response gives travel time with current traffic, the
  delay, and the slow sections (jam, road works, closure) with their
  effective speed, which the app draws on the route.
- Departure time: for trips leaving later, the request adds `departAt`
  (RFC 3339) and TomTom answers with **predicted** traffic for that time,
  from historic patterns. The UI labels it "predicted", never "live".
- Preferred automatically when the key is set (`ROUTING_PROVIDER` overrides).
  Commercial terms with a free tier; attribution "© TomTom" is shown.

### Stops along a route: OpenStreetMap via Overpass (default)

- Same endpoints and policy as parking (`OVERPASS_URLS`). One corridor query
  per trip (`around:400` metres of a thinned polyline) for `amenity=fuel`,
  `amenity=charging_station`, `highway=rest_area` and `highway=services`,
  cached for 24 hours. Private stops are hidden. Facilities (toilets, shop,
  café, restaurant, car wash, air, EV charging) come from the OSM tags.
- Because public Overpass instances are slow, stops load after the rest of
  the trip and never delay it.

### Weather along a route

- Open-Meteo, one request per trip with all sampled points (up to 12, one
  every 10 km) and the hourly forecast. Each point shows the conditions for
  the time the driver is expected there: current conditions within 30
  minutes of departure, the nearest hourly forecast slot after that. For a
  later departure (up to 7 days ahead) every point uses the hourly
  forecast, and the request asks for enough forecast days to cover it. Same
  terms and attribution as above.
- Quota: the free API's daily limit is per IP address. Multi-location
  requests are weighted, so a trip likely counts as several calls. On shared
  cloud IPs the limit can already be used up by others: on 2026-10-20 this
  project's sandbox received `HTTP 429 "Daily API request limit exceeded"`.
  The app then shows the weather as unavailable and keeps the rest of the
  trip. Production deployments should use an Open-Meteo API plan or a
  self-hosted instance (`OPEN_METEO_URL`).

## Cameras

### Community registry (default)

Cameras contributed by pull request in `data/cameras/<country>/<city>.json`.
Every entry records its operator, licence, terms URL and three permissions
(`embedAllowed`, `aiAnalysisAllowed`, `commercialUseAllowed`). See
[adding-a-camera.md](adding-a-camera.md).

**Current state:** one Israeli entry, the Western Wall live stream, as an
external link only (see below). No Israeli source with terms that allow
embedding or AI analysis has been found yet. We would rather ship few
cameras than cameras whose terms we cannot show. To ask an
operator for permission, use the
[permission request letter](camera-permission-request.md).

### Coverage areas

Feed-based camera providers declare the area they cover (a bounding box).
A search only calls the providers whose area overlaps it, so enabling the
Finnish or Singaporean feed costs nothing for a search in Israel. The same
applies to trips: only feeds covering the route are asked.

### YouTube live streams (`mediaType: "youtube"`)

Many operators publish live cameras on YouTube. The registry accepts a
`youtube.com` watch, `/live/`, playlist or `channel/<id>/live` URL, and the
app shows it in YouTube's own embedded player on `youtube-nocookie.com`
(YouTube's privacy-enhanced mode). This is what YouTube's Terms of Service
allow: embedding through the YouTube player when the channel has enabled
embedding. We never download, re-stream or analyse the video, so
`aiAnalysisAllowed` must not be `true` for these cameras. Only add streams
published by the camera's operator itself; re-uploads of someone else's
camera are not accepted.

### Fintraffic road weather cameras, Finland (default)

- API: `https://tie.digitraffic.fi/api/weathercam/v1/stations` (Digitraffic,
  no key; gzip and a `Digitraffic-User` header are required). Verified live
  on 2026-10-21: 815 stations, 2,268 active views. Images at
  `https://weathercam.digitraffic.fi/<preset>.jpg`, updated about every 10
  minutes.
- Operator: Fintraffic.
- Licence: **Creative Commons Attribution 4.0**, including commercial use,
  per <https://www.digitraffic.fi/en/terms-of-service/>.
- Attribution: **"Source: Fintraffic / digitraffic.fi, license CC 4.0 BY"**.
- The image proxy only fetches from `weathercam.digitraffic.fi`.
- Switch off with `DIGITRAFFIC_CAMERAS_ENABLED=false`.

### LTA traffic cameras, Singapore (default)

- API: `https://api.data.gov.sg/v1/transport/traffic-images` (no key). The
  feed returns the latest snapshot of each camera; image URLs change with
  every snapshot, so the list is refreshed every minute. On 2026-10-21 the
  feed listed only 8 cameras (it has listed far more in the past); the
  provider shows whatever the feed returns.
- Operator: Land Transport Authority (LTA), published on data.gov.sg.
- Licence: **Singapore Open Data Licence v1.0**
  (<https://data.gov.sg/open-data-licence>), commercial use allowed.
- Attribution, as the licence asks: "Contains information from Traffic
  Images accessed on _date_ from LTA via data.gov.sg, made available under
  the terms of the Singapore Open Data Licence version 1.0".
- The image proxy only fetches from `images.data.gov.sg`.
- Switch off with `SG_TRAFFIC_CAMERAS_ENABLED=false`.

### Transport Department snapshots, Hong Kong (opt-in: `HK_TRAFFIC_CAMERAS_ENABLED=true`)

- Camera list:
  `https://static.data.gov.hk/td/traffic-snapshot-images/code/Traffic_Camera_Locations_En.xml`
  (no key). Verified live on 2026-10-21: 1,013 cameras, JPEG snapshots on
  `tdcctv.data.one.gov.hk`, updated every 2 minutes.
- Operator: Transport Department, HKSAR Government, published on DATA.GOV.HK.
- Terms: <https://data.gov.hk/en/terms-and-conditions>. Browsing,
  downloading, distributing and reproducing are allowed free of charge, for
  commercial and non-commercial purposes, with attribution to the
  Government, the Transport Department and DATA.GOV.HK.
- **Why it is opt-in:** the terms also require users to indemnify the
  Government against infringement claims arising from their use. That is a
  legal commitment the person running the server should make knowingly.

### Feeds we looked at and did not add

- **New York City DOT cameras** (`webcams.nyctmc.org`): an open JSON API
  exists, but we found no reuse licence, and in 2024 the city sent a
  cease-and-desist letter to an artist whose site used the feeds, citing the
  site's terms of use.
- **Caltrans CCTV (California)**: the CWWP2 JSON feeds are public, but we
  could not read the Conditions of Use page to confirm reuse terms.
- **Ontario 511**: the camera API now requires a key.

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
  page <https://thekotel.org/he/kotel/kotel_cameras/> plays the live view in a
  third-party player (`wm.cast-tv.com`). The YouTube playlist on the same
  page holds information videos, not the camera (checked 2026-10-21). No
  reuse terms are published, so it is in the registry as an **external link
  only** (`il-jerusalem-western-wall-plaza`). If the foundation streams the
  camera on its YouTube channel, or grants permission, it can be embedded.
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

## Photos ("what it looks like here")

Published photos near the point and near a trip's destination. They are not
live: every photo shows when it was taken. The browser gets metadata and an
id; the server fetches the image from the URL the provider returned (the
same SSRF-safe fetcher as camera images) and keeps it in memory only. The AI
never sees these photos.

### Panoramax (default)

- API: `https://api.panoramax.xyz/api/search?bbox=…` (STAC, no key), the
  meta-catalog of the federated Panoramax instances. Verified live on
  2026-10-21: street-level pictures in central Jerusalem (Dec 2025), with
  500 px thumbnails and 2048 px images served by the hosting instance (for
  example `panoramax.openstreetmap.fr`).
- Licence: per picture, reported in the item (`license`, plus a `license`
  link); almost all are **CC BY-SA 4.0**, some instances use etalab-2.0.
  We show the licence and the contributor's name with every photo.
- Faces and licence plates are blurred by Panoramax before publication.
- Switch off with `PANORAMAX_ENABLED=false`. Point `PANORAMAX_URL` at a
  single instance's API if you prefer.
- Want more coverage? Anyone can upload street-level photos to Panoramax;
  the empty state links there.

### Wikimedia Commons (default)

- API: the MediaWiki Action API, `generator=geosearch` on
  `commons.wikimedia.org` with `prop=imageinfo` (no key). Results include the
  licence (`LicenseShortName`, `LicenseUrl`), author and date for each file.
- Licence: chosen by each author (CC BY, CC BY-SA, public domain…). We show
  the licence, author and a link to the file page with every photo.
- Rate limits (2026): clients with an identifying User-Agent get 200
  requests a minute and should keep concurrency at 3 or less. The provider
  sends `APP_USER_AGENT`, spaces requests, and after HTTP 429 stays away for
  two minutes. From the shared development sandbox Commons sometimes
  answered 429; a normal server is unlikely to hit the limit, and results
  are cached for 6 hours.
- Images are only fetched from `upload.wikimedia.org` and
  `thumb.wikimedia.org`.
- Switch off with `WIKIMEDIA_COMMONS_ENABLED=false`.

### Mapillary (❌ not included yet)

Mapillary has the largest street-level coverage, including in Israel, and
its imagery is CC BY-SA. It is not included because its terms
(<https://www.mapillary.com/terms>, read 2026-10-21) require apps that show
its images to **display the Mapillary logo** and link back to Mapillary,
image URLs from the API expire, and commercial use is limited to specific
purposes. A provider that meets these terms (opt-in, with an access token
and the logo) is a welcome contribution.

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
