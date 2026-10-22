# Deploying AI Street Situation

The app is a single Docker container with no database and no keys required.
It runs comfortably in 512 MB of RAM. This page covers running it, putting
up a public demo, and what to check before you share the link.

## Run the published image

Every push to `main` publishes an image to the GitHub Container Registry
(`.github/workflows/docker-publish.yml`), for `linux/amd64` and `linux/arm64`:

```bash
docker run --rm -p 3000:3000 ghcr.io/yossi123654/ai-street-situation:latest
# with your settings:
docker run --rm -p 3000:3000 --env-file .env ghcr.io/yossi123654/ai-street-situation:latest
```

Open <http://localhost:3000>. Tags: `latest` follows `main`, `X.Y.Z` and
`X.Y` follow release tags, and `sha-<commit>` pins an exact build.

## Public demo, option 1: Render (one click)

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/yossi123654/ai-street-situation)

The button reads [`render.yaml`](../render.yaml): a free web service built
from the Dockerfile, with the demo notice on, `TRUST_PROXY=true` and a health
check on `/api/health`. Render asks for `APP_USER_AGENT` and
`NOMINATIM_EMAIL` during setup (see the checklist below). Free instances
sleep after 15 minutes without traffic, so the first visit after a pause takes
about a minute.

## Public demo, option 2: Fly.io

[`fly.toml`](../fly.toml) runs the published image on one small machine that
stops when idle and starts on the next request:

```bash
fly launch --no-deploy --copy-config --name <your-app-name>
fly secrets set APP_USER_AGENT="AI-Street-Situation (https://<your-site>; you@example.org)"
fly deploy
```

## Option 3: your own server

On any machine with Docker, `docker compose up -d` (see
[`docker-compose.yml`](../docker-compose.yml)) and a reverse proxy for HTTPS,
for example Caddy:

```
street.example.org {
  reverse_proxy 127.0.0.1:3000
}
```

Set `TRUST_PROXY=true` only when the app is reachable **only** through that
proxy.

## Checklist before sharing a public link

The default sources are free public services run by volunteers and small
organisations. A demo is welcome on all of them; heavy traffic is not.

- **Identify yourself.** Set `APP_USER_AGENT` to your deployment's name with
  a contact URL or email, and `NOMINATIM_EMAIL`. Nominatim's policy requires
  an identifying User-Agent, and Wikimedia rate-limits anonymous clients.
- **Show the demo notice.** `SITE_NOTICE=demo` shows a translated banner
  saying it is a demo on shared sources and pointing to self-hosting (set
  any other text to replace it).
- **Keep the rate limits on.** The defaults are 60 API requests a minute per
  visitor (`RATE_LIMIT_PER_MINUTE`) and 1,200 in total
  (`GLOBAL_RATE_LIMIT_PER_MINUTE`). Lower the global limit for a small demo.
  Calls to Nominatim, OSRM and Overpass are also serialised in bounded
  queues inside the app.
- **Trust the proxy, correctly.** On Render and Fly, `TRUST_PROXY=true`
  makes the per-visitor limit use the address the platform's proxy adds
  (the last `X-Forwarded-For` entry). Without a trusted proxy leave it off.
- **Know each source's terms** ([sources.md](sources.md)):
  - Nominatim (geocoding): max 1 request a second, no heavy use. For more
    traffic, run your own Nominatim or Photon and set `NOMINATIM_URL`, or use
    `GEOCODING_PROVIDER=google` with a key.
  - Open-Meteo (weather): free for **non-commercial** use, about 10,000 calls
    a day per IP. A public demo of an open-source project is fine; a
    commercial deployment needs an Open-Meteo API plan.
  - OSRM on routing.openstreetmap.de (trips): max 1 request a second, with
    attribution (shown).
  - Overpass: only used outside the prebuilt extracts (Israel ships with
    one, see [data/osm](../data/osm/README.md)).
  - Panoramax and Wikimedia Commons (photos), Fintraffic and data.gov.sg
    (cameras): open data with attribution (shown).
- **Optional keys** (TomTom or HERE for traffic, Anthropic or Ollama for AI)
  go in the platform's secret settings, never in the repository. Paid APIs
  on a public demo can run up a bill; set usage caps with the provider.
- **Privacy stays the same:** no accounts, no analytics, no tracking. The
  home page only sends a location rounded to about 1 km, and only when the
  visitor allows it.

## Updating

Render redeploys on every push to `main` (`autoDeploy`). On Fly, run
`fly deploy` to pull the latest image. With Docker,
`docker pull ghcr.io/yossi123654/ai-street-situation:latest` and restart.
