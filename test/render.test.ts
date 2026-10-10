import { FLAVORS } from "@sm-steel/neon-kit";
import { describe, expect, it } from "vitest";
import type { Track } from "../src/history.js";
import { LAYOUT, renderFallback, renderRecent } from "../src/render.js";

const p = FLAVORS.mocha;
const now = new Date("2026-10-10T12:00:00Z");
const track = (
	title: string,
	artists = "Artist",
	date = "2026-10-10",
): Track => ({ title, artists, date });
const five = [
	track("ПРИЛЕТЕЛА", "MiatriSs"),
	track("B"),
	track("C"),
	track("D", "X", "2026-10-09"),
	track("E", "Y", "2026-10-08"),
];

describe("renderRecent", () => {
	it("draws one row per track, the newest title in accent", () => {
		const svg = renderRecent(five, [], p, "UTC", now);
		expect(svg.match(/font-weight="700"/g)).toHaveLength(5);
		expect(svg).toContain(`fill="${p.accent}">ПРИЛЕТЕЛА</text>`);
		expect(svg).toContain(`fill="${p.text}">B</text>`);
	});

	it("labels days, right-aligned", () => {
		const svg = renderRecent(five, [], p, "UTC", now);
		expect(svg).toMatch(/text-anchor="end"[^>]*>today</);
		expect(svg).toContain(">yesterday<");
		expect(svg).toContain(">Oct 8<");
	});

	it("escapes text and keeps Cyrillic intact (Review Focus 2)", () => {
		const svg = renderRecent(
			[track(`Rock & <Roll> "Ёж"`, `A & B`)],
			[],
			p,
			"UTC",
			now,
		);
		expect(svg).toContain("Rock &amp; &lt;Roll&gt; &quot;Ёж&quot;");
		expect(svg).toContain("A &amp; B");
	});

	it("cuts long titles and artist lists to one line with …", () => {
		const svg = renderRecent(
			[track("x".repeat(200), "y".repeat(200))],
			[],
			p,
			"UTC",
			now,
		);
		expect(svg).toMatch(/x+…</);
		expect(svg).toMatch(/y+…</);
	});

	it("shrinks to the number of tracks (Review Focus 3)", () => {
		const two = renderRecent(five.slice(0, 2), [], p, "UTC", now);
		const full = renderRecent(five, [], p, "UTC", now);
		expect(two.match(/font-weight="700"/g)).toHaveLength(2);
		const h = (s: string) => Number(s.match(/height="([\d.]+)"/)?.[1]);
		expect(h(full) - h(two)).toBe(3 * LAYOUT.row);
	});

	it("embeds covers with ym- clip ids, or a placeholder square", () => {
		const svg = renderRecent(
			five.slice(0, 2),
			["data:image/jpeg;base64,AQID", undefined],
			p,
			"UTC",
			now,
		);
		expect(svg).toContain('clip-path="url(#ym-c0)"');
		expect(svg).toContain('href="data:image/jpeg;base64,AQID"');
		expect(svg).not.toContain("ym-c1");
		expect(svg).toContain(`rx="2" fill="${p.border}"`);
	});
});

describe("renderFallback", () => {
	it("shows the reason in a neon card", () => {
		const svg = renderFallback("yandex 401", p);
		expect(svg).toContain("SIGNAL LOST");
		expect(svg).toContain("yandex 401");
		expect(svg).toContain("RECENTLY PLAYED");
	});
});
