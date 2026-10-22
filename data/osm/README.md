# Prebuilt OpenStreetMap extracts

The app answers **parking** and **stops along a route** queries from these
files instead of calling a public Overpass server for every search. Outside
the area of every extract, it still uses Overpass.

| File         | Area                                                                                             |
| ------------ | ------------------------------------------------------------------------------------------------ |
| `il.json.gz` | Israel and the Palestinian territories (the outline of the Geofabrik / openstreetmap.fr extract) |

Each file holds only what the app reads: car parks (`amenity=parking`), fuel
stations, EV chargers, rest areas and motorway services, with their position
and a handful of tags (name, fee, capacity, opening hours, access, brand,
facilities).

## Licence

**The data in this folder is not covered by the project's MIT licence.** It
is © OpenStreetMap contributors and available under the
[Open Database License (ODbL) 1.0](https://opendatacommons.org/licenses/odbl/1-0/).
If you redistribute these files or a database derived from them, keep the
attribution and the ODbL. See <https://www.openstreetmap.org/copyright>.

`regions.json` is part of the project and MIT-licensed.

## Updating

The recommended way uses a downloaded OSM extract and the
[`osmium`](https://osmcode.org/osmium-tool/) command-line tool (`apt install
osmium-tool`, `brew install osmium-tool`). It takes seconds and puts no load
on public servers:

```bash
curl -fsSLO https://download.geofabrik.de/asia/israel-and-palestine-latest.osm.pbf
curl -fsSLO https://download.geofabrik.de/asia/israel-and-palestine.poly
npm run osm:extract -- il --pbf=israel-and-palestine-latest.osm.pbf --poly=israel-and-palestine.poly
```

With `--poly`, the extract records the area's outline, and the app only
answers from it for searches entirely inside that outline (so Amman, inside
the bounding box but outside the extract, still goes to Overpass).

Without a download, `npm run osm:extract -- il` queries Overpass in tiles
instead (slow, and public Overpass servers are often overloaded). Behind an
HTTP proxy, run it with `NODE_USE_ENV_PROXY=1`.

A GitHub Actions workflow (`.github/workflows/osm-extract.yml`) rebuilds the
extract from Geofabrik every week and opens a pull request when it changed.

## Adding a region

Download the region's `.osm.pbf` and `.poly` from
[Geofabrik](https://download.geofabrik.de/) and run
`npm run osm:extract -- <region> --pbf=... --poly=... --name="..."`. Keep
regions modest (a country or a metropolitan area): the whole file is loaded
into memory. For the Overpass method, add the region's bounding box
(`[south, west, north, east]`) to `regions.json`.
