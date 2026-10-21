# Adding a camera

Cameras live in JSON files, one per city:

```
data/cameras/<country>/<city>.json      e.g. data/cameras/il/jerusalem.json
```

Every pull request runs `npm run validate:cameras` in CI. Run it locally
before opening your PR.

## Before you start: is the camera allowed?

We only accept **public** cameras whose operator publishes them on purpose
(a traffic authority, a municipality, a tourism board, a public webcam
site). For each camera you must find:

1. **Who operates it**, with a link.
2. **The terms of use or licence**, with a link (`license.termsUrl`).
3. What those terms say about **embedding**, **AI analysis** and
   **commercial use**.

Then set each permission:

| Value       | When to use it                                                                                                              |
| ----------- | --------------------------------------------------------------------------------------------------------------------------- |
| `true`      | The terms explicitly allow it (for example an open licence such as CC BY or OGL, or a written statement from the operator). |
| `false`     | The terms forbid it.                                                                                                        |
| `"unknown"` | The terms say nothing, are unclear, or you could not find them.                                                             |

`"unknown"` is fine and common. The app then shows the camera **as an
external link only**: no embedding and no AI analysis. Never set `true`
because something seems harmless. When in doubt, use `"unknown"`.

Not accepted: private cameras, cameras that show the inside of homes or
businesses, streams that need a login, and URLs scraped from a site that
forbids reuse.

## The entry

```jsonc
{
  "$schema": "../../../schemas/camera-file.schema.json",
  "cameras": [
    {
      "id": "il-jerusalem-jaffa-king-george", // <country>-<city>-<place>, kebab-case, unique
      "name": "Jaffa St / King George St",
      "description": "Looking east along Jaffa Street", // optional
      "country": "il", // must match the folder
      "city": "jerusalem", // must match the file name
      "location": { "lat": 31.7827, "lon": 35.2165 },
      "cameraType": "traffic", // traffic | scenic | public
      "mediaType": "image", // image | video | youtube | link
      "sourceUrl": "https://operator.example/cameras/123", // human-facing page
      "mediaUrl": "https://images.operator.example/123.jpg", // direct image/video; omit for "link"
      "operator": { "name": "Example Transport Authority", "url": "https://operator.example" },
      "license": {
        "name": "CC BY 4.0",
        "termsUrl": "https://operator.example/open-data-terms",
        "attribution": "© Example Transport Authority", // optional, shown with the image
      },
      "permissions": {
        "embedAllowed": true,
        "aiAnalysisAllowed": true,
        "commercialUseAllowed": "unknown",
      },
      "refreshSeconds": 60, // how often the source updates
      "verification": { "lastVerified": "2026-10-14", "verifiedBy": "your-github-username" },
      "notes": "Optional notes for reviewers",
    },
  ],
}
```

(JSON files cannot contain comments. Remove them when you copy this.)

Rules the validator enforces:

- `sourceUrl` and `mediaUrl` use `https://` and a domain name (no IP
  addresses, no `localhost`).
- `mediaUrl` is required for `image`, `video` and `youtube`, and forbidden for `link`.
- For `youtube`, `mediaUrl` is a `youtube.com` watch, `/live/`, playlist or
  `channel/<id>/live` URL (see below).
- `aiAnalysisAllowed: true` only for `image` cameras.
- `id` starts with the country code and is unique across all files.
- `country` and `city` match the folder and file name.
- `lastVerified` is a real date and not in the future.

## YouTube live cameras

Many operators stream their cameras on YouTube. Use `"mediaType": "youtube"`
and one of these as `mediaUrl`:

- `https://www.youtube.com/watch?v=<video id>` or `https://www.youtube.com/live/<video id>`
- `https://www.youtube.com/playlist?list=<playlist id>`
- `https://www.youtube.com/channel/<channel id starting with UC>/live`
  (the channel's current live stream; it keeps working when the stream
  restarts with a new video id)

The app plays it in YouTube's own player (`youtube-nocookie.com`), which
YouTube's terms allow when the channel has enabled embedding. Set
`embedAllowed: true` only when:

- the stream is published **by the camera's operator** (not a re-upload), and
- embedding is enabled (YouTube's oEmbed endpoint,
  `https://www.youtube.com/oembed?url=<the URL>&format=json`, returns 200).

Use `"license": { "name": "YouTube Terms of Service (embedded player)", "termsUrl": "https://www.youtube.com/t/terms" }`
unless the operator publishes its own terms. `aiAnalysisAllowed` must be
`false` or `"unknown"`: the app never analyses video.

## Asking an operator for permission

Most cameras end up as `"unknown"` because the operator never published
terms. Asking usually takes one email. Use the
[permission request letter](camera-permission-request.md) (Hebrew and
English) and link the operator's reply in `notes` or `license.termsUrl`.

## Checklist for your pull request

- [ ] The operator publishes this camera publicly and on purpose.
- [ ] `license.termsUrl` points to the actual terms, and the permissions match them.
- [ ] Coordinates point at the camera (check on <https://www.openstreetmap.org>).
- [ ] `refreshSeconds` roughly matches how often the image changes.
- [ ] `npm run validate:cameras` passes.
- [ ] If you add a new source, add it to [`docs/sources.md`](sources.md).

## Adding a whole source (many cameras)

If an operator publishes a machine-readable list of cameras (an API or a
JSON/CSV feed), it is usually better to write a **camera provider** that
reads the feed than to copy hundreds of entries. See the TfL JamCams provider
(`src/providers/cameras/tflJamCam.ts`) and [adding-a-provider.md](adding-a-provider.md).
