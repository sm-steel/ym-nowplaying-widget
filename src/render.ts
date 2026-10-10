import {
	type CardOptions,
	card,
	charsPerLine,
	esc,
	FONT_STACK,
	type Palette,
	wrapLines,
} from "@sm-steel/neon-kit";
import { dayLabel } from "./days.js";
import type { Track } from "./history.js";

export const LAYOUT = {
	width: 868,
	row: 56,
	cover: 48,
	textX: 64,
	dayColumn: 96,
} as const;

const FONT: CardOptions["font"] = { variant: "text", weights: [400, 700] };
const TEXT_WIDTH = LAYOUT.width - LAYOUT.textX - LAYOUT.dayColumn;
const TITLE_CHARS = charsPerLine(TEXT_WIDTH, 16);
const ARTIST_CHARS = charsPerLine(TEXT_WIDTH, 13);

/** One line of text, cut with "…" when it doesn't fit. */
const oneLine = (s: string, max: number) =>
	s ? (wrapLines(s, max, 1)[0] ?? "") : "";

function cover(
	i: number,
	href: string | undefined,
	y: number,
	p: Palette,
): string {
	const box = `x="0" y="${y}" width="${LAYOUT.cover}" height="${LAYOUT.cover}"`;
	if (!href) return `<rect ${box} rx="2" fill="${p.border}"/>`;
	return (
		`<clipPath id="ym-c${i}"><rect ${box} rx="2"/></clipPath>` +
		`<image ${box} href="${href}" clip-path="url(#ym-c${i})" preserveAspectRatio="xMidYMid slice"/>` +
		`<rect ${box} rx="2" fill="none" stroke="${p.border}"/>`
	);
}

export function renderRecent(
	tracks: Track[],
	covers: (string | undefined)[],
	p: Palette,
	tz: string,
	now: Date = new Date(),
): string {
	const rows = tracks
		.map((t, i) => {
			const y = i * LAYOUT.row;
			return (
				cover(i, covers[i], y, p) +
				`<text x="${LAYOUT.textX}" y="${y + 20}" font-size="16" font-weight="700" fill="${i === 0 ? p.accent : p.text}">${esc(oneLine(t.title, TITLE_CHARS))}</text>` +
				`<text x="${LAYOUT.textX}" y="${y + 40}" font-size="13" fill="${p.subtext}">${esc(oneLine(t.artists, ARTIST_CHARS))}</text>` +
				`<text x="${LAYOUT.width}" y="${y + 20}" font-size="13" text-anchor="end" fill="${p.subtext}">${esc(dayLabel(t.date, tz, now))}</text>`
			);
		})
		.join("");
	return card(
		{
			width: LAYOUT.width,
			height: tracks.length * LAYOUT.row - (LAYOUT.row - LAYOUT.cover),
			palette: p,
			seed: "ym",
			label: "Recently played on Yandex Music",
			title: "Recently Played",
			font: FONT,
		},
		`<g font-family="${FONT_STACK}">${rows}</g>`,
	);
}

export function renderFallback(reason: string, p: Palette): string {
	return card(
		{
			width: LAYOUT.width,
			height: 20,
			palette: p,
			seed: "ym",
			label: `Recently played on Yandex Music: unavailable (${reason})`,
			title: "Recently Played",
			font: FONT,
		},
		`<text x="0" y="15" font-family="${FONT_STACK}" font-size="13" fill="${p.subtext}"><tspan fill="${p.accent}">// SIGNAL LOST</tspan> · ${esc(reason)}</text>`,
	);
}
