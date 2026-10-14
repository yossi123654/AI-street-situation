# Community camera registry

One JSON file per city: `data/cameras/<country>/<city>.json`.

The registry is intentionally small. It only contains cameras whose operator
and terms of use are documented. See [docs/adding-a-camera.md](../../docs/adding-a-camera.md)
for the format and the review checklist, and [docs/sources.md](../../docs/sources.md)
for the sources we have looked at.

Validate your changes with:

```bash
npm run validate:cameras
```

Images are never stored in this repository: only metadata and source URLs.
