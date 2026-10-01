"""Vercel serverless function: renders a Catppuccin 'now playing' SVG card for
Yandex Music, backed by the unofficial Ynison protocol (MarshalX/yandex-music-api).

Styled to match sm-steel/sm-steel's other profile-README card blocks exactly
(../scripts/render-cards.mjs there): same 900px width, same outer/card padding,
radius and palette hex values, same Monaspace Neon font (embedded here as a
base64 @font-face — those cards are pre-rendered PNGs since their content is
static, this one can't be since it's live).

Env vars:
    YM_TOKEN — Yandex Music OAuth token (see scripts/get_token.py to mint one).

Query params:
    theme=dark|light — defaults to dark.

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
from pathlib import Path
from urllib.parse import parse_qs, urlparse

from yandex_music import Client
from yandex_music.ynison import simple as ynison

TOKEN = os.environ.get("YM_TOKEN", "")
DEVICE_ID = "9089862716d2c-widget"
YNISON_TIMEOUT = 8.0

# Matches sm-steel/sm-steel's scripts/render-cards.mjs palettes exactly.
PALETTES = {
    "dark": {
        "base": "#1e1e2e",
        "surface": "#313244",
        "border": "#45475a",
        "text": "#cdd6f4",
        "accent": "#cba6f7",
    },
    "light": {
        "base": "#eff1f5",
        "surface": "#e6e9ef",
        "border": "#ccd0da",
        "text": "#4c4f69",
        "accent": "#8839ef",
    },
}

# Same WIDTH and card metrics (padding "20px 24px", radius 14) as render-cards.mjs.
WIDTH = 900
OUTER_PAD = 16
CARD_PAD_X, CARD_PAD_Y = 24, 20
CARD_RADIUS = 14
ART_SIZE, ART_RADIUS = 90, 8

CARD_WIDTH = WIDTH - OUTER_PAD * 2
CARD_HEIGHT = CARD_PAD_Y * 2 + ART_SIZE
HEIGHT = OUTER_PAD * 2 + CARD_HEIGHT

ART_X = OUTER_PAD + CARD_PAD_X
ART_Y = OUTER_PAD + CARD_PAD_Y
TEXT_X = ART_X + ART_SIZE + 20

_FONT_FAMILY = "'Monaspace Neon', ui-monospace, monospace"
_FONTS_DIR = Path(__file__).parent / "fonts"


def _font_data_uri(filename: str) -> str:
    data = (_FONTS_DIR / filename).read_bytes()
    return "data:font/woff2;base64," + base64.b64encode(data).decode()


_FONT_FACES = f"""
    @font-face {{
      font-family: 'Monaspace Neon';
      src: url({_font_data_uri("monaspace-neon-400.woff2")}) format('woff2');
      font-weight: 400;
      font-style: normal;
    }}
    @font-face {{
      font-family: 'Monaspace Neon';
      src: url({_font_data_uri("monaspace-neon-700.woff2")}) format('woff2');
      font-weight: 700;
      font-style: normal;
    }}
""".strip()


def _truncate(text: str, max_chars: int) -> str:
    return text if len(text) <= max_chars else text[: max_chars - 1].rstrip() + "…"


def _svg_shell(theme: str, body_lines: list[str]) -> str:
    p = PALETTES[theme]
    lines = [
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{WIDTH}" height="{HEIGHT}"'
        f' viewBox="0 0 {WIDTH} {HEIGHT}">',
        f"  <style>{_FONT_FACES}</style>",
        f'  <rect width="{WIDTH}" height="{HEIGHT}" fill="{p["base"]}" />',
        f'  <rect x="{OUTER_PAD}" y="{OUTER_PAD}" width="{CARD_WIDTH}" height="{CARD_HEIGHT}"'
        f' rx="{CARD_RADIUS}" ry="{CARD_RADIUS}" fill="{p["surface"]}"'
        f' stroke="{p["border"]}" stroke-width="1" />',
        *body_lines,
        "</svg>",
    ]
    return "\n".join(lines)


def render_svg(theme: str, title: str, artist: str, cover_data_uri: str) -> str:
    """cover_data_uri must be a data: URI — external hrefs don't load when this SVG is
    displayed via <img>, since that renders in a sandboxed image context."""
    p = PALETTES[theme]
    title = html.escape(_truncate(title, 60))
    artist = html.escape(_truncate(artist, 80))
    cover_data_uri = html.escape(cover_data_uri, quote=True)

    body = [
        f'  <clipPath id="art-clip"><rect x="{ART_X}" y="{ART_Y}" width="{ART_SIZE}"'
        f' height="{ART_SIZE}" rx="{ART_RADIUS}" ry="{ART_RADIUS}" /></clipPath>',
        f'  <rect x="{ART_X}" y="{ART_Y}" width="{ART_SIZE}" height="{ART_SIZE}"'
        f' rx="{ART_RADIUS}" ry="{ART_RADIUS}" fill="{p["border"]}" />',
        f'  <image href="{cover_data_uri}" x="{ART_X}" y="{ART_Y}"'
        f' width="{ART_SIZE}" height="{ART_SIZE}" clip-path="url(#art-clip)"'
        f' preserveAspectRatio="xMidYMid slice" />',
        f'  <text x="{TEXT_X}" y="{ART_Y + 34}" font-family="{_FONT_FAMILY}"'
        f' font-size="20" font-weight="700" fill="{p["accent"]}">{title}</text>',
        f'  <text x="{TEXT_X}" y="{ART_Y + 62}" font-family="{_FONT_FAMILY}"'
        f' font-size="16" font-weight="400" fill="{p["text"]}">{artist}</text>',
    ]
    return _svg_shell(theme, body)


def render_fallback(theme: str, message: str) -> str:
    p = PALETTES[theme]
    message = html.escape(message)

    body = [
        f'  <text x="{TEXT_X}" y="{ART_Y + ART_SIZE / 2 + 6}" font-family="{_FONT_FAMILY}"'
        f' font-size="16" font-weight="400" fill="{p["text"]}">{message}</text>',
    ]
    return _svg_shell(theme, body)


def fetch_now_playing_svg(theme: str) -> str:
    if not TOKEN:
        return render_fallback(theme, "YM_TOKEN not configured")

    state = ynison.get_state(TOKEN, device_id=DEVICE_ID, timeout=YNISON_TIMEOUT)
    queue = state.player_state.player_queue
    idx = queue.current_playable_index
    if not (0 <= idx < len(queue.playable_list)):
        return render_fallback(theme, "Nothing queued")
    playable = queue.playable_list[idx]

    client = Client(TOKEN)  # no .init(): skips an account/status round-trip tracks() doesn't need
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
    return render_svg(theme, title=title, artist=artist, cover_data_uri=cover_data_uri)


class handler(BaseHTTPRequestHandler):  # noqa: N801 -- Vercel requires this exact name
    def do_GET(self):
        query = parse_qs(urlparse(self.path).query)
        theme = query.get("theme", ["dark"])[0]
        if theme not in PALETTES:
            theme = "dark"

        # GitHub's Camo proxy times out on slow origins (~4s), and a fresh render takes 3-4s,
        # so let Vercel's CDN serve the last good card instantly and re-render in the
        # background. Errors are never cached, so a hiccup can't replace a good card.
        try:
            svg = fetch_now_playing_svg(theme)
            cache_control = "public, max-age=0, s-maxage=30, stale-while-revalidate=86400"
        except Exception as e:
            svg = render_fallback(theme, f"error: {type(e).__name__}")
            cache_control = "no-store"

        body = svg.encode("utf-8")

        self.send_response(200)
        self.send_header("Content-Type", "image/svg+xml; charset=utf-8")
        self.send_header("Cache-Control", cache_control)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)
