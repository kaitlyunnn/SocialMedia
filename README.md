# SocialMedia — Buffer Instagram automation

Posts to Instagram (**@zipjeweler**) through [Buffer's GraphQL API](https://developers.buffer.com/),
driven entirely from this repo: drop a JSON file in `queue/`, push, and GitHub
Actions schedules it in Buffer. Scheduled entries are archived to `posted/`
with the resulting Buffer post ID.

## One-time setup

1. Generate a Buffer API key at <https://publish.buffer.com/settings/api>.
2. In this repo: **Settings → Secrets and variables → Actions → New repository
   secret**, name it `BUFFER_API_KEY`, paste the key.

That's it — the Instagram channel ID is already in `buffer.config.json`.

## Adding a post

Create `queue/<anything>.json` (files are processed in filename order, so a
date prefix like `2026-07-15-sale.json` keeps things tidy):

```json
{
  "text": "New drop just landed ✨ #jewelry",
  "image": {
    "url": "https://your-host.com/photo.jpg",
    "altText": "Gold pendant on white background"
  }
}
```

Push to the default branch and the workflow adds it to your Buffer queue
(Buffer then publishes it at your next [posting-schedule](https://publish.buffer.com) slot).

Files starting with `_` are ignored — see `queue/_example.json` for every
supported field.

### Optional fields

| Field | Values | Notes |
|---|---|---|
| `mode` | `addToQueue` (default), `shareNow`, `shareNext`, `customScheduled` | `customScheduled` requires `dueAt` |
| `dueAt` | ISO 8601 with offset, e.g. `2026-07-15T10:00:00-05:00` | Central Time is `-05:00` in summer, `-06:00` in winter |
| `instagram.type` | `post` (default), `reel`, `story` | `reel`/`story` need a `video` asset |
| `instagram.firstComment` | string | Good spot for hashtag blocks |
| `video` | `{ "url": "...", "thumbnailUrl": "...", "title": "..." }` | Instead of `image` |
| `schedulingType` | `automatic` (default), `notification` | `notification` sends a reminder to your phone instead of auto-publishing |

### Image requirements

- Must be a **publicly reachable direct URL** (Buffer fetches it — no auth,
  no HTML pages). GitHub raw URLs of images committed to this repo work:
  `https://raw.githubusercontent.com/kaitlyunnn/SocialMedia/main/media/photo.jpg`
- Instagram feed: JPEG/PNG, aspect ratio between 4:5 and 1.91:1.

## How it runs

- **On push** touching `queue/**` — schedules new entries immediately.
- **Daily at 14:43 UTC** — retries anything left in the queue (e.g. if your
  Buffer plan's scheduled-post limit was full; the free plan allows 10 at a time).
- **Manually** — Actions tab → "Buffer — drain post queue" → Run workflow
  (has a dry-run option that prints payloads without posting).

Run locally:

```sh
BUFFER_API_KEY=xxx node scripts/post.mjs   # real run
DRY_RUN=1 node scripts/post.mjs            # validate queue without posting
```

## Layout

```
buffer.config.json   channel IDs + defaults
queue/               pending posts (one JSON file each)
posted/              archive of scheduled posts, incl. Buffer post IDs
scripts/post.mjs     zero-dependency Node script that calls Buffer's API
.github/workflows/   the automation
```
