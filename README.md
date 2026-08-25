# ym-nowplaying-widget

A Catppuccin Mocha "now playing" SVG card for Yandex Music, embeddable in a
GitHub profile README via `<img src>`. Built as a Vercel Python serverless
function on top of the unofficial [`MarshalX/yandex-music-api`](https://github.com/MarshalX/yandex-music-api)
Ynison client.

## Known limitation

Ynison (Yandex's cross-device playback-sync protocol) does not reliably report
play/pause state or track progress for this setup — confirmed even from the
official desktop app, across a re-login. So this card shows **track title +
artist + album art only**: no progress bar, no live pause indicator. It
reflects the most recent track in the account's queue, which updates close to
real time as tracks change — in practice this reads as "now playing" even
though it's technically "last queued."

## How it works

1. `api/nowplaying.py` is a Vercel Python function (`GET /api/nowplaying`).
2. On each request it opens a short-lived Ynison websocket session
   (`yandex_music.ynison.simple.get_state`) to read the current track from
   the account's queue.
3. Resolves artist name + cover art via the regular REST client
   (`yandex_music.Client`).
4. Fetches the cover art server-side and embeds it as a base64 `data:` URI —
   **required**, since an SVG shown via `<img>` renders in a sandboxed image
   context that blocks external resource fetches from inside the SVG.
5. Renders a Catppuccin Mocha–themed SVG and returns it with a short cache
   window (`max-age=30`).

## Setup

### 1. Get a token

```
uv run python scripts/get_token.py
```

Opens a device-auth flow: visit the printed URL, enter the code, confirm on
your Yandex account. Prints an `access_token` good for ~1 year. **Don't
commit it anywhere** — it grants full account access.

### 2. Deploy to Vercel

```
vercel link
vercel env add YM_TOKEN production   # paste the token from step 1
vercel deploy --prod
```

### 3. Embed in your README

```html
<img src="https://<your-deployment>.vercel.app/api/nowplaying" alt="Yandex Music now playing" />
```

## Local dev

```
uv sync
YM_TOKEN=... uv run python -c "
import sys; sys.path.insert(0, 'api')
import nowplaying
print(nowplaying.fetch_now_playing_svg())
"
```
