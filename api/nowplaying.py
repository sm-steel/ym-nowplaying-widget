"""Vercel serverless function: renders a Catppuccin Mocha 'now playing' SVG card
for Yandex Music, backed by the unofficial Ynison protocol (MarshalX/yandex-music-api).

Env vars:
    YM_TOKEN — Yandex Music OAuth token (see scripts/get_token.py to mint one).

Known limitation (see README): Ynison doesn't reliably report play/pause state or
progress for this account's devices, so this card only shows track/artist/cover art —
no progress bar, no live pause indicator. It reflects the most recent track in the
account's queue, which updates close to real time as tracks change.
"""

import base64
import html
import os
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler

from yandex_music import Client
from yandex_music.ynison import simple as ynison

TOKEN = os.environ.get("YM_TOKEN", "")
DEVICE_ID = "9089862716d2c-widget"
YNISON_TIMEOUT = 8.0

PALETTE = {
    "base": "#1e1e2e",
    "surface0": "#313244",
    "mauve": "#cba6f7",
    "pink": "#f5c2e7",
    "text": "#cdd6f4",
    "subtext0": "#a6adc8",
}

WIDTH, HEIGHT = 480, 120
ART_SIZE, ART_X, ART_Y = 90, 15, 15


def _truncate(text: str, max_chars: int) -> str:
    return text if len(text) <= max_chars else text[: max_chars - 1].rstrip() + "…"


_FONT = "'Segoe UI', -apple-system, sans-serif"


def render_svg(title: str, artist: str, cover_data_uri: str, label: str = "NOW PLAYING") -> str:
    """cover_data_uri must be a data: URI — external hrefs don't load when this SVG is
    displayed via <img>, since that renders in a sandboxed image context."""
    title = html.escape(_truncate(title, 34))
    artist = html.escape(_truncate(artist, 44))
    cover_data_uri = html.escape(cover_data_uri, quote=True)
    label = html.escape(label)
    tx = ART_X + ART_SIZE + 20

    lines = [
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{WIDTH}" height="{HEIGHT}"'
        f' viewBox="0 0 {WIDTH} {HEIGHT}">',
        "  <defs>",
        '    <clipPath id="art-clip">',
        f'      <rect x="{ART_X}" y="{ART_Y}" width="{ART_SIZE}" height="{ART_SIZE}"'
        f' rx="8" ry="8" />',
        "    </clipPath>",
        "  </defs>",
        f'  <rect x="0.5" y="0.5" width="{WIDTH - 1}" height="{HEIGHT - 1}" rx="12" ry="12"'
        f' fill="{PALETTE["base"]}" stroke="{PALETTE["mauve"]}"'
        f' stroke-opacity="0.5" stroke-width="1" />',
        f'  <rect x="{ART_X}" y="{ART_Y}" width="{ART_SIZE}" height="{ART_SIZE}" rx="8" ry="8"'
        f' fill="{PALETTE["surface0"]}" />',
        f'  <image href="{cover_data_uri}" x="{ART_X}" y="{ART_Y}"'
        f' width="{ART_SIZE}" height="{ART_SIZE}" clip-path="url(#art-clip)"'
        f' preserveAspectRatio="xMidYMid slice" />',
        f'  <text x="{tx}" y="42" font-family="{_FONT}" font-size="11" font-weight="600"'
        f' letter-spacing="1.5" fill="{PALETTE["pink"]}">{label}</text>',
        f'  <text x="{tx}" y="66" font-family="{_FONT}" font-size="18" font-weight="600"'
        f' fill="{PALETTE["text"]}">{title}</text>',
        f'  <text x="{tx}" y="88" font-family="{_FONT}" font-size="14"'
        f' fill="{PALETTE["subtext0"]}">{artist}</text>',
        "</svg>",
    ]
    return "\n".join(lines)


def render_fallback(message: str) -> str:
    message = html.escape(message)
    tx = ART_X + ART_SIZE + 20
    art_cx, art_cy = ART_X + ART_SIZE / 2, ART_Y + ART_SIZE / 2 + 6

    lines = [
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{WIDTH}" height="{HEIGHT}"'
        f' viewBox="0 0 {WIDTH} {HEIGHT}">',
        f'  <rect x="0.5" y="0.5" width="{WIDTH - 1}" height="{HEIGHT - 1}" rx="12" ry="12"'
        f' fill="{PALETTE["base"]}" stroke="{PALETTE["mauve"]}"'
        f' stroke-opacity="0.5" stroke-width="1" />',
        f'  <rect x="{ART_X}" y="{ART_Y}" width="{ART_SIZE}" height="{ART_SIZE}" rx="8" ry="8"'
        f' fill="{PALETTE["surface0"]}" />',
        f'  <text x="{art_cx}" y="{art_cy}" font-size="30" text-anchor="middle">🎵</text>',
        f'  <text x="{tx}" y="55" font-family="{_FONT}" font-size="14"'
        f' fill="{PALETTE["subtext0"]}">{message}</text>',
        "</svg>",
    ]
    return "\n".join(lines)


def fetch_now_playing_svg() -> str:
    if not TOKEN:
        return render_fallback("YM_TOKEN not configured")

    state = ynison.get_state(TOKEN, device_id=DEVICE_ID, timeout=YNISON_TIMEOUT)
    queue = state.player_state.player_queue
    idx = queue.current_playable_index
    if not (0 <= idx < len(queue.playable_list)):
        return render_fallback("Nothing queued")
    playable = queue.playable_list[idx]

    client = Client(TOKEN).init()
    track = client.tracks([playable.playable_id])[0]
    artist = ", ".join(a.name for a in track.artists if a.name) or "Unknown artist"

    cover_data_uri = ""
    if track.cover_uri:
        cover_url = "https://" + track.cover_uri.replace("%%", "200x200")
        try:
            cover_bytes = urllib.request.urlopen(cover_url, timeout=5).read()
            cover_data_uri = "data:image/jpeg;base64," + base64.b64encode(cover_bytes).decode()
        except (urllib.error.URLError, OSError):  # OSError covers TimeoutError too
            cover_data_uri = ""

    title = track.title or "Untitled track"
    return render_svg(title=title, artist=artist, cover_data_uri=cover_data_uri)


class handler(BaseHTTPRequestHandler):  # noqa: N801 -- Vercel requires this exact name
    def do_GET(self):
        try:
            svg = fetch_now_playing_svg()
        except Exception as e:
            svg = render_fallback(f"error: {type(e).__name__}")

        body = svg.encode("utf-8")
        cache_control = "public, max-age=30, s-maxage=30, stale-while-revalidate=120"

        self.send_response(200)
        self.send_header("Content-Type", "image/svg+xml; charset=utf-8")
        self.send_header("Cache-Control", cache_control)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)
