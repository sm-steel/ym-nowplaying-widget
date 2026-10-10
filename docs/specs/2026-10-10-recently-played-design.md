# Yandex "recently played" widget — design (2026-10-10)

Sub-project 4 of the profile neon restyle (see `sm-steel/neon-kit` `docs/specs/2026-10-10-neon-kit-design.md`).

## Context

The widget currently shows Yandex Music's "now playing" track. It gets that from the unofficial Ynison WebSocket protocol through the Python `yandex_music` library, and it works poorly. It also still uses the old rounded card style. This rewrite:
- shows the **5 most recently played tracks**, from Yandex's plain REST history endpoint, which a throwaway test on 2026-10-10 showed returns HTTP 200 in about 0.15s;
- ports the widget from **Python to TypeScript**;
- renders it with **`@sm-steel/neon-kit`**, so it matches the other profile cards.

Decided with the user:
- **Keep** the repo `sm-steel/ym-nowplaying-widget`, the Vercel project and its URL. The new endpoint is `/api/recent`. `/api/nowplaying` stays as an alias, so the current README keeps working until it is switched over.
- **Rows** show the cover, the title (bold, with the newest one in the accent colour), the artists, and a right-aligned **day label** (`today`, `yesterday`, or `Oct 8`). History only records days, not times.
- **Approach A:** a Vercel serverless function with CDN caching. The rejected alternative was a GitHub Action writing static SVGs.

## Data

- **Request:** `GET https://api.music.yandex.net/music-history?fullModelsCount=15` with header `Authorization: OAuth ${YM_TOKEN}`.
- **Response shape** (verified): `result.historyTabs[]` contains `{ date: "YYYY-MM-DD", items[] }`, each item contains `{ context, tracks[] }`, and each track contains `{ type, data: { itemId, fullModel? } }`.
- **Note:** `fullModelsCount` counts history *entries*, not tracks. Asking for 15 reliably yields at least 5 full tracks; asking for 5 gave only 3.
- **Selection:** the first 5 tracks in order whose `fullModel` exists. Each gives `title`, `artists[].name` (joined with ", "), `coverUri` (optional) and its tab's `date`.
- **Covers:** `https://` + `coverUri` with `%%` replaced by `100x100`. All 5 are fetched in parallel, with a 3s timeout each, and embedded as `data:image/jpeg;base64,…`. A cover that fails falls back to a placeholder square.
- **Day labels** are computed in an IANA timezone taken from the `WIDGET_TZ` env var, default `Europe/Moscow`:
  - same date as "today" in that timezone → `today`;
  - the day before → `yesterday`;
  - anything older → `Mon D` (e.g. `Oct 8`), using English month names.

## Rendering

- `card()` from neon-kit with `title: "Recently Played"`, `font: { variant: "text", weights: [400, 700] }`, `seed: "ym"` and `label: "Recently played on Yandex Music"`.
- Palette: `FLAVORS.mocha` for `?theme=dark` (the default) and `FLAVORS.latte` for `?theme=light`. Any other value is treated as dark.
- Content width is 868, so the outer width is 900, matching the other profile cards. Rows are 56px apart; each row is 48px tall.
- Each row contains:
  - the cover, 48×48 with `rx=2`, clipped, plus a 1px `border` stroke;
  - at x=64, the title: 16px bold, accent colour on row 0 and `text` on the rest, one line, cut off with "…" via `wrapLines(title, maxChars, 1)`;
  - at x=64, y+40, the artists: 13px, `subtext` colour, one line, also cut off with "…";
  - the day label: 13px, `subtext` colour, right-aligned at the content's right edge (`text-anchor="end"`).
- The title and artist columns are narrowed so they never run into the day label: `charsPerLine(868 − 64 − 96, size)`.
- All text is escaped with `esc()`. Clip-path ids use a `ym-` prefix, so they can't clash with kit ids.

## Endpoint

- `api/recent.ts` exports `GET(request: Request): Promise<Response>`, a Vercel Node function.
- `vercel.json` rewrites `/api/nowplaying` to `/api/recent`. Function `maxDuration` is 15.
- **Success:** `200`, `Content-Type: image/svg+xml; charset=utf-8`, `Cache-Control: public, max-age=0, s-maxage=60, stale-while-revalidate=86400`.
- **Failure:** missing `YM_TOKEN`, a non-200 from Yandex, a malformed body, zero tracks, or a timeout (8s overall for the history call).
  - The response is `200` with the same neon card, showing `// SIGNAL LOST` and a short reason (`no token`, `yandex 401`, `no recent tracks`, `timeout`, `bad response`).
  - `Cache-Control: no-store`, so a failure never replaces a good card in the CDN.
  - The status stays 200 so GitHub's image proxy (Camo) still shows a card.

## Repo changes

- **Remove:** `api/nowplaying.py`, `api/fonts/`, `pyproject.toml`, `uv.lock`, `.python-version`, `scripts/get_token.py`, `.ropeproject/` and `.ruff_cache/` (local junk). `.venv/` is local only.
- **Add:**
  - `package.json` with `@sm-steel/neon-kit ^1.1.0` as the only runtime dependency.
  - `mise.toml` (Node 24.21.0), `tsconfig.json`, `biome.json` (same config as the other repos) and Vitest.
  - `src/history.ts`: fetch and parse.
  - `src/days.ts`: day labels.
  - `src/render.ts`: SVG building.
  - `api/recent.ts`.
  - `scripts/get-token.ts`: the Yandex device-code login. It runs `POST https://oauth.yandex.ru/device/code`, polls `POST /token` with `grant_type=device_code`, and uses the Yandex Music Android app's public client id and secret, as the Python library does. The token is printed only to the user's terminal.
- **`.gitignore`:** add `node_modules/`. Also `y0_*` (any file named like a Yandex token) and `token*.txt`, so a mistyped command can't commit a token.
- **Deploy workflow:** switch from `setup-uv` to `jdx/mise-action@v5` and `npm ci`, and update `actions/checkout` to v7. The `vercel pull` / `vercel build` / `vercel deploy` steps and their secrets stay as they are.
- **README:** document the new endpoint, `?theme`, `WIDGET_TZ`, and how to mint a token.

## Testing

All tests run offline: fixtures plus a fake `fetch`, no network.
- **`history`:**
  - picks the first 5 tracks with a `fullModel`, in order, and skips entries without one;
  - joins artists with ", ";
  - builds the cover URL;
  - attaches each tab's `date`;
  - maps HTTP errors, malformed JSON and empty history to typed errors with the reasons listed above.
- **`days`:** `today` and `yesterday` across midnight in `Europe/Moscow` while UTC is still the previous day; an older date gives `Oct 8`; a custom `WIDGET_TZ` is honoured.
- **`render`:**
  - 5 rows;
  - row 0 title in the accent colour;
  - Cyrillic titles escaped and kept intact;
  - long titles and artists cut off with "…";
  - the day label right-aligned;
  - a placeholder when a cover is missing;
  - a fallback card for each failure reason.
- **`api/recent`:** content type and cache headers on success; `no-store` on failure; the theme switch.
- **Preview gate:** a local preview rendered from the user's real history, using a fresh token the user mints in their own terminal. The user approves it before deploying.
- **Deploy check:** after an approved push, request the live `/api/recent?theme=dark|light` and `/api/nowplaying`, then check the profile README rendering in both themes.

## Out of scope

- "Now playing" or Ynison of any kind.
- Exact play times, which the API doesn't provide.
- Rewriting the README section header (the typing-SVG line) beyond swapping the image URL.
