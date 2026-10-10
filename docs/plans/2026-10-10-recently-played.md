# Recently-Played Widget Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Python Ynison "now playing" widget with a TypeScript Vercel function that renders the user's 5 most recently played Yandex Music tracks as a neon-kit card.

**Architecture:**
- Three small pure modules: `days` (day labels), `history` (Yandex REST fetch, parse, covers) and `render` (SVG via `@sm-steel/neon-kit`).
- A handler in `api/recent.ts` with injectable dependencies for tests. `vercel.json` aliases `/api/nowplaying` to it.
- Local scripts (`get-token`, `preview`) run with `tsx`. Source files import each other with `.js` extensions (standard NodeNext), so Vercel's TypeScript build, Vitest and tsx all resolve them.

**Tech Stack:**
- Node 24.21 (mise), TypeScript 7 (type-check only), `@sm-steel/neon-kit` ^1.1.0.
- Vitest 5, Biome 2, tsx (dev), Vercel CLI (deploy).

**Spec:** `docs/specs/2026-10-10-recently-played-design.md`. Read it alongside this plan.

## Global Constraints

- Branch `feat/recent-ts` already exists, with the spec commit on it. Work there and never commit to `main` directly.
- Runtime dependency: only `@sm-steel/neon-kit` ^1.1.0. Everything else is a devDependency.
- **History request:** `GET https://api.music.yandex.net/music-history?fullModelsCount=15`, header `Authorization: OAuth ${YM_TOKEN}`, 8s timeout.
- **Covers:** `https://` + `coverUri` with `%%` replaced by `100x100`, fetched in parallel, 3s timeout each, embedded as data URIs. A failed cover becomes a placeholder.
- **Day labels:** computed in `WIDGET_TZ`, default `Europe/Moscow`; an invalid value falls back to the default. Values are `today`, `yesterday` or `Mon D`.
- **Card:** title `Recently Played`, `font: { variant: "text", weights: [400, 700] }`, `seed: "ym"`, `label: "Recently played on Yandex Music"`, content width 868, rows 56px apart, cover 48×48 `rx=2`.
- **Themes:** `?theme=light` uses Latte; anything else uses Mocha.
- **Success headers:** `image/svg+xml; charset=utf-8`, `Cache-Control: public, max-age=0, s-maxage=60, stale-while-revalidate=86400`.
- **Failure response:** status 200, the same card showing `// SIGNAL LOST · <reason>`, `Cache-Control: no-store`. Reasons are `no token`, `yandex <status>`, `no recent tracks`, `timeout` or `bad response`.
- **Clip-path ids** in content use the `ym-` prefix.
- **Never print, log or commit the token.** Test fixtures contain no real token. `.gitignore` gets `y0_*` and `token*.txt`.
- Git commit author is the machine default. Every commit message ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Never loosen Biome rules or add exclude patterns. Fix the code instead, or ask the user.
- **Outward-facing steps need the user's go-ahead at that moment:** push, merge, deploy, and editing the `sm-steel` README.

## Review Focus

1. **A track with no artists** (`artists: []`): expected to show an empty artist line, with no crash and no stray ", ". Tested in Task 2.
2. **Titles or artists with `& < > " '` or Cyrillic:** expected to be escaped, with the Cyrillic kept intact. Tested in Task 3.
3. **Fewer than 5 full tracks** (e.g. 2): expected to shrink the card to 2 rows, with no empty rows and no crash. Tested in Task 3.
4. **A cover that returns 404, a non-image, or throws:** expected to show a placeholder square while the other covers still load. Tested in Task 2.
5. **An invalid `WIDGET_TZ`** (e.g. `Mars/Base`): expected to fall back to `Europe/Moscow` without an error card. Tested in Task 1.

---

## File structure

```
ym-nowplaying-widget/
  .gitattributes         (exists) LF
  .gitignore             + node_modules/, preview/out/, y0_*, token*.txt
  mise.toml              node 24.21.0
  package.json           type module, deps, scripts
  tsconfig.json          type-check only (noEmit)
  biome.json             same config as contrib-neon
  vercel.json            function config + /api/nowplaying rewrite
  api/recent.ts          GET handler (thin) + handle() with injectable deps
  src/days.ts            resolveTz, dayLabel
  src/history.ts         Track, HistoryError, parseHistory, fetchRecent, fetchCovers
  src/render.ts          renderRecent, renderFallback
  scripts/get-token.ts   Yandex device-code login → token to terminal or --out file
  scripts/preview.ts     renders real + fallback samples to preview/out, --serve
  test/fixtures/history.json
  test/days.test.ts  test/history.test.ts  test/render.test.ts  test/recent.test.ts  test/get-token.test.ts
  .github/workflows/deploy.yml   uv → mise/npm
  README.md
  REMOVED: api/nowplaying.py, api/fonts/, pyproject.toml, uv.lock, .python-version, scripts/get_token.py
```

---

### Task 1: Scaffold the TypeScript project, remove Python, `days.ts`

**Files:**
- Create: `mise.toml`, `package.json`, `tsconfig.json`, `biome.json`, `src/days.ts`, `test/days.test.ts`
- Modify: `.gitignore`
- Delete: `api/nowplaying.py`, `api/fonts/`, `pyproject.toml`, `uv.lock`, `.python-version`, `scripts/get_token.py`

**Interfaces:**
- Produces:
  - `DEFAULT_TZ = "Europe/Moscow"`
  - `resolveTz(tz: string | undefined): string`
  - `dayLabel(date: string /* YYYY-MM-DD */, tz: string, now?: Date): string`

- [ ] **Step 1: Remove Python and local junk; write the config files**

```bash
cd ~/src/ym-nowplaying-widget
git rm -q -r api/nowplaying.py api/fonts pyproject.toml uv.lock .python-version scripts/get_token.py
rm -rf .venv .ropeproject .ruff_cache
```

Append to `.gitignore`:
```
node_modules/
preview/out/
# never commit Yandex tokens, even if a mistyped command writes one to a file
y0_*
token*.txt
```

`mise.toml`:
```toml
[tools]
node = "24.21.0"

[tasks.test]
run = "npx vitest run"

[tasks.preview]
run = "npx tsx scripts/preview.ts --serve"

[tasks.token]
run = "npx tsx scripts/get-token.ts"
```

`package.json`:
```json
{
	"name": "ym-nowplaying-widget",
	"private": true,
	"type": "module",
	"engines": { "node": "24.x" },
	"scripts": {
		"test": "vitest run",
		"lint": "biome check .",
		"typecheck": "tsc --noEmit",
		"preview": "tsx scripts/preview.ts --serve",
		"token": "tsx scripts/get-token.ts"
	}
}
```

`tsconfig.json`:
```json
{
	"compilerOptions": {
		"target": "ES2023",
		"module": "NodeNext",
		"moduleResolution": "NodeNext",
		"strict": true,
		"noEmit": true,
		"verbatimModuleSyntax": true,
		"skipLibCheck": true,
		"types": ["node"]
	},
	"include": ["api", "src", "scripts", "test"]
}
```

`biome.json`: copy `~/src/contrib-neon/biome.json`, then set `files.includes` to `["**"]`. `preview/out/` and `node_modules/` are gitignored, and `vcs.useIgnoreFile` already skips them.

- [ ] **Step 2: Install dependencies**

```bash
mise trust -q && mise install
mise exec -- npm i @sm-steel/neon-kit@^1.1.0
mise exec -- npm i -D typescript@^7.0.2 @types/node@^26.6.5 vitest@^5.0.3 @biomejs/biome@^2.5.15 tsx
```
Expected: `dependencies` contains only `@sm-steel/neon-kit`.

- [ ] **Step 3: Write the failing test** `test/days.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { DEFAULT_TZ, dayLabel, resolveTz } from "../src/days.js";

// 2026-10-10 22:30 UTC is already 2026-10-11 01:30 in Moscow (UTC+3)
const lateUtc = new Date("2026-10-10T22:30:00Z");

describe("dayLabel", () => {
	it("says today/yesterday relative to the widget's timezone, not UTC", () => {
		expect(dayLabel("2026-10-11", DEFAULT_TZ, lateUtc)).toBe("today");
		expect(dayLabel("2026-10-10", DEFAULT_TZ, lateUtc)).toBe("yesterday");
		expect(dayLabel("2026-10-10", "UTC", lateUtc)).toBe("today");
	});
	it("shows a short date for anything older", () => {
		expect(dayLabel("2026-10-08", DEFAULT_TZ, lateUtc)).toBe("Oct 8");
		expect(dayLabel("2025-12-31", DEFAULT_TZ, lateUtc)).toBe("Dec 31");
	});
	it("handles month and year boundaries for yesterday", () => {
		expect(dayLabel("2026-12-31", "UTC", new Date("2027-01-01T12:00:00Z"))).toBe("yesterday");
	});
});

describe("resolveTz", () => {
	it("defaults to Moscow and rejects invalid zones (Review Focus 5)", () => {
		expect(resolveTz(undefined)).toBe(DEFAULT_TZ);
		expect(resolveTz("")).toBe(DEFAULT_TZ);
		expect(resolveTz("Mars/Base")).toBe(DEFAULT_TZ);
		expect(resolveTz("Asia/Tokyo")).toBe("Asia/Tokyo");
	});
});
```

- [ ] **Step 4: Run it to verify it fails**

Run: `mise exec -- npx vitest run test/days.test.ts`
Expected: FAIL, because `../src/days.js` can't be resolved.

- [ ] **Step 5: Implement** `src/days.ts`

```ts
export const DEFAULT_TZ = "Europe/Moscow";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** A valid IANA timezone, or the default when missing/invalid. */
export function resolveTz(tz: string | undefined): string {
	if (!tz) return DEFAULT_TZ;
	try {
		new Intl.DateTimeFormat("en-US", { timeZone: tz });
		return tz;
	} catch {
		return DEFAULT_TZ;
	}
}

/** YYYY-MM-DD of `now` in `tz`. */
function isoDay(now: Date, tz: string): string {
	return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

/** "today", "yesterday", or "Mon D" for a history tab date (YYYY-MM-DD) as seen in `tz`. */
export function dayLabel(date: string, tz: string, now: Date = new Date()): string {
	const today = isoDay(now, tz);
	if (date === today) return "today";
	const [y, m, d] = today.split("-").map(Number) as [number, number, number];
	const yesterday = new Date(Date.UTC(y, m - 1, d - 1)).toISOString().slice(0, 10);
	if (date === yesterday) return "yesterday";
	const [, mm, dd] = date.split("-").map(Number) as [number, number, number];
	return `${MONTHS[mm - 1]} ${dd}`;
}
```

- [ ] **Step 6: Run tests, lint, typecheck**

Run: `mise exec -- npx vitest run && mise exec -- npx biome check --write . && mise exec -- npx tsc --noEmit`
Expected: 4 tests PASS. Biome and tsc clean.

- [ ] **Step 7: Commit**
```bash
git add -A && git commit -m "Port to TypeScript: scaffold, drop Python, add day labels

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: `history.ts` (fetch, parse, covers)

**Files:**
- Create: `src/history.ts`, `test/history.test.ts`, `test/fixtures/history.json`

**Interfaces:**
- Produces:
  - `interface Track { title: string; artists: string; cover?: string; date: string }`
  - `type Reason = "no token" | "no recent tracks" | "timeout" | "bad response" | \`yandex ${number}\``
  - `class HistoryError extends Error { reason: Reason }`
  - `parseHistory(json: unknown, limit?: number): Track[]`, where `limit` defaults to 5
  - `fetchRecent(token: string | undefined, fetchFn?: typeof fetch, timeoutMs?: number): Promise<Track[]>`, where `timeoutMs` defaults to 8000
  - `fetchCovers(tracks: Track[], fetchFn?: typeof fetch, timeoutMs?: number): Promise<(string | undefined)[]>`, where `timeoutMs` defaults to 3000 and each result is a data URI or undefined

- [ ] **Step 1: Write the fixture** `test/fixtures/history.json`, which matches the real response shape (verified 2026-10-10) and contains no token:

```json
{
	"result": {
		"historyTabs": [
			{
				"date": "2026-10-10",
				"items": [
					{
						"context": { "type": "album", "data": {} },
						"tracks": [
							{ "type": "track", "data": { "itemId": { "trackId": "1" }, "fullModel": { "title": "ПРИЛЕТЕЛА", "artists": [{ "name": "MiatriSs" }], "coverUri": "avatars.yandex.net/get-music-content/1/a/%%" } } },
							{ "type": "track", "data": { "itemId": { "trackId": "2" } } }
						]
					}
				]
			},
			{
				"date": "2026-10-09",
				"items": [
					{
						"context": { "type": "wave", "data": {} },
						"tracks": [
							{ "type": "track", "data": { "itemId": { "trackId": "3" }, "fullModel": { "title": "Awakening", "artists": [{ "name": "Normandie" }], "coverUri": "avatars.yandex.net/get-music-content/2/b/%%" } } },
							{ "type": "track", "data": { "itemId": { "trackId": "4" }, "fullModel": { "title": "Go", "artists": [{ "name": "The Chemical Brothers" }, { "name": "Q-Tip" }], "coverUri": "avatars.yandex.net/get-music-content/3/c/%%" } } },
							{ "type": "track", "data": { "itemId": { "trackId": "5" }, "fullModel": { "title": "victory lap", "artists": [] } } },
							{ "type": "track", "data": { "itemId": { "trackId": "6" }, "fullModel": { "title": "Hard Feelings", "artists": [{ "name": "Poppy" }], "coverUri": "avatars.yandex.net/get-music-content/4/d/%%" } } },
							{ "type": "track", "data": { "itemId": { "trackId": "7" }, "fullModel": { "title": "Sixth", "artists": [{ "name": "Nobody" }], "coverUri": "x/%%" } } }
						]
					}
				]
			}
		]
	}
}
```

- [ ] **Step 2: Write the failing test** `test/history.test.ts`

```ts
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { fetchCovers, fetchRecent, HistoryError, parseHistory } from "../src/history.js";

const fixture = JSON.parse(readFileSync(new URL("./fixtures/history.json", import.meta.url), "utf8"));
const json = (body: unknown, status = 200) =>
	vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }));

describe("parseHistory", () => {
	it("takes the first 5 tracks that have a full model, in order, with their tab date", () => {
		const tracks = parseHistory(fixture);
		expect(tracks.map((t) => t.title)).toEqual(["ПРИЛЕТЕЛА", "Awakening", "Go", "victory lap", "Hard Feelings"]);
		expect(tracks[0]).toEqual({
			title: "ПРИЛЕТЕЛА",
			artists: "MiatriSs",
			cover: "https://avatars.yandex.net/get-music-content/1/a/100x100",
			date: "2026-10-10",
		});
		expect(tracks[1]?.date).toBe("2026-10-09");
	});
	it("joins artists and tolerates none or no cover (Review Focus 1)", () => {
		const tracks = parseHistory(fixture);
		expect(tracks[2]?.artists).toBe("The Chemical Brothers, Q-Tip");
		expect(tracks[3]).toMatchObject({ title: "victory lap", artists: "" });
		expect(tracks[3]?.cover).toBeUndefined();
	});
	it("rejects malformed bodies and empty history", () => {
		expect(() => parseHistory({ nope: 1 })).toThrow(HistoryError);
		expect(() => parseHistory({ result: { historyTabs: [] } })).toThrow(/no recent tracks/);
	});
});

describe("fetchRecent", () => {
	it("requests 15 entries with the OAuth header", async () => {
		const fetchFn = json(fixture);
		await fetchRecent("tok", fetchFn);
		const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
		expect(url).toBe("https://api.music.yandex.net/music-history?fullModelsCount=15");
		expect((init.headers as Record<string, string>).Authorization).toBe("OAuth tok");
	});
	it("maps failures to reasons", async () => {
		await expect(fetchRecent(undefined, json(fixture))).rejects.toMatchObject({ reason: "no token" });
		await expect(fetchRecent("t", json({}, 401))).rejects.toMatchObject({ reason: "yandex 401" });
		const bad = vi.fn(async () => new Response("<html>", { status: 200 }));
		await expect(fetchRecent("t", bad)).rejects.toMatchObject({ reason: "bad response" });
		const slow = vi.fn(async (_u: unknown, init?: RequestInit) => {
			init?.signal?.throwIfAborted();
			throw Object.assign(new Error("aborted"), { name: "TimeoutError" });
		});
		await expect(fetchRecent("t", slow, 1)).rejects.toMatchObject({ reason: "timeout" });
	});
});

describe("fetchCovers", () => {
	it("embeds covers as data URIs and leaves failures empty (Review Focus 4)", async () => {
		const tracks = parseHistory(fixture).slice(0, 3);
		const fetchFn = vi.fn(async (url: string | URL | Request) => {
			const u = String(url);
			if (u.includes("/1/")) return new Response(new Uint8Array([1, 2, 3]), { headers: { "content-type": "image/jpeg" } });
			if (u.includes("/2/")) return new Response("nope", { status: 404 });
			throw new Error("network down");
		});
		const covers = await fetchCovers(tracks, fetchFn);
		expect(covers[0]).toBe("data:image/jpeg;base64,AQID");
		expect(covers[1]).toBeUndefined();
		expect(covers[2]).toBeUndefined();
	});
	it("skips the request for tracks without a cover", async () => {
		const fetchFn = vi.fn();
		const covers = await fetchCovers([{ title: "x", artists: "", date: "2026-10-10" }], fetchFn);
		expect(covers).toEqual([undefined]);
		expect(fetchFn).not.toHaveBeenCalled();
	});
	it("rejects non-image responses", async () => {
		const fetchFn = vi.fn(async () => new Response("<html>", { headers: { "content-type": "text/html" } }));
		const [cover] = await fetchCovers(parseHistory(fixture).slice(0, 1), fetchFn);
		expect(cover).toBeUndefined();
	});
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `mise exec -- npx vitest run test/history.test.ts`
Expected: FAIL, because `../src/history.js` can't be resolved.

- [ ] **Step 4: Implement** `src/history.ts`

```ts
// Reads the 5 most recently played tracks from Yandex Music's REST history endpoint.

export interface Track {
	title: string;
	/** Artist names joined with ", " (may be empty). */
	artists: string;
	/** Absolute 100x100 cover URL, when the track has one. */
	cover?: string;
	/** History tab date, YYYY-MM-DD. */
	date: string;
}

export type Reason = "no token" | "no recent tracks" | "timeout" | "bad response" | `yandex ${number}`;

export class HistoryError extends Error {
	constructor(readonly reason: Reason) {
		super(reason);
		this.name = "HistoryError";
	}
}

const HISTORY_URL = "https://api.music.yandex.net/music-history?fullModelsCount=15";

interface FullModel {
	title?: unknown;
	artists?: { name?: unknown }[];
	coverUri?: unknown;
}

/** The first `limit` tracks with full metadata, newest first. */
export function parseHistory(json: unknown, limit = 5): Track[] {
	const tabs = (json as { result?: { historyTabs?: unknown } })?.result?.historyTabs;
	if (!Array.isArray(tabs)) throw new HistoryError("bad response");
	const tracks: Track[] = [];
	for (const tab of tabs as { date?: unknown; items?: { tracks?: { data?: { fullModel?: FullModel } }[] }[] }[]) {
		for (const item of tab.items ?? []) {
			for (const t of item.tracks ?? []) {
				const m = t.data?.fullModel;
				if (!m || typeof m.title !== "string" || typeof tab.date !== "string") continue;
				tracks.push({
					title: m.title,
					artists: (m.artists ?? [])
						.map((a) => a.name)
						.filter((n): n is string => typeof n === "string" && n !== "")
						.join(", "),
					cover: typeof m.coverUri === "string" ? `https://${m.coverUri.replace("%%", "100x100")}` : undefined,
					date: tab.date,
				});
				if (tracks.length === limit) return tracks;
			}
		}
	}
	if (tracks.length === 0) throw new HistoryError("no recent tracks");
	return tracks;
}

const isTimeout = (e: unknown) => e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError");

export async function fetchRecent(
	token: string | undefined,
	fetchFn: typeof fetch = fetch,
	timeoutMs = 8000,
): Promise<Track[]> {
	if (!token) throw new HistoryError("no token");
	let res: Response;
	try {
		res = await fetchFn(HISTORY_URL, {
			headers: { Authorization: `OAuth ${token}` },
			signal: AbortSignal.timeout(timeoutMs),
		});
	} catch (e) {
		throw new HistoryError(isTimeout(e) ? "timeout" : "bad response");
	}
	if (!res.ok) throw new HistoryError(`yandex ${res.status}`);
	let body: unknown;
	try {
		body = await res.json();
	} catch {
		throw new HistoryError("bad response");
	}
	return parseHistory(body);
}

/** Each track's cover as a data URI, or undefined when it has none or the download fails. */
export function fetchCovers(
	tracks: Track[],
	fetchFn: typeof fetch = fetch,
	timeoutMs = 3000,
): Promise<(string | undefined)[]> {
	return Promise.all(
		tracks.map(async (t) => {
			if (!t.cover) return undefined;
			try {
				const res = await fetchFn(t.cover, { signal: AbortSignal.timeout(timeoutMs) });
				const type = res.headers.get("content-type") ?? "";
				if (!res.ok || !type.startsWith("image/")) return undefined;
				const data = Buffer.from(await res.arrayBuffer()).toString("base64");
				return `data:${type.split(";")[0]};base64,${data}`;
			} catch {
				return undefined;
			}
		}),
	);
}
```

- [ ] **Step 5: Run tests, lint, typecheck**

Run: `mise exec -- npx vitest run && mise exec -- npx biome check --write . && mise exec -- npx tsc --noEmit`
Expected: all PASS, clean.

- [ ] **Step 6: Commit**
```bash
git add -A && git commit -m "Fetch and parse Yandex listening history with covers

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: `render.ts`

**Files:**
- Create: `src/render.ts`, `test/render.test.ts`

**Interfaces:**
- Consumes:
  - `Track` (Task 2)
  - `dayLabel` (Task 1)
  - from neon-kit: `card`, `charsPerLine`, `esc`, `FONT_STACK`, `type Palette`, `wrapLines`
- Produces:
  - `LAYOUT = { width: 868, row: 56, cover: 48, textX: 64, dayColumn: 96 }`
  - `renderRecent(tracks: Track[], covers: (string | undefined)[], p: Palette, tz: string, now?: Date): string`
  - `renderFallback(reason: string, p: Palette): string`

- [ ] **Step 1: Write the failing test** `test/render.test.ts`

```ts
import { FLAVORS } from "@sm-steel/neon-kit";
import { describe, expect, it } from "vitest";
import type { Track } from "../src/history.js";
import { LAYOUT, renderFallback, renderRecent } from "../src/render.js";

const p = FLAVORS.mocha;
const now = new Date("2026-10-10T12:00:00Z");
const track = (title: string, artists = "Artist", date = "2026-10-10"): Track => ({ title, artists, date });
const five = [track("ПРИЛЕТЕЛА", "MiatriSs"), track("B"), track("C"), track("D", "X", "2026-10-09"), track("E", "Y", "2026-10-08")];

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
		const svg = renderRecent([track(`Rock & <Roll> "Ёж"`, `A & B`)], [], p, "UTC", now);
		expect(svg).toContain("Rock &amp; &lt;Roll&gt; &quot;Ёж&quot;");
		expect(svg).toContain("A &amp; B");
	});

	it("cuts long titles and artist lists to one line with …", () => {
		const svg = renderRecent([track("x".repeat(200), "y".repeat(200))], [], p, "UTC", now);
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
		const svg = renderRecent(five.slice(0, 2), ["data:image/jpeg;base64,AQID", undefined], p, "UTC", now);
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
```

- [ ] **Step 2: Run it to verify it fails**

Run: `mise exec -- npx vitest run test/render.test.ts`
Expected: FAIL, because `../src/render.js` can't be resolved.

- [ ] **Step 3: Implement** `src/render.ts`

```ts
import { card, charsPerLine, esc, FONT_STACK, type Palette, wrapLines } from "@sm-steel/neon-kit";
import { dayLabel } from "./days.js";
import type { Track } from "./history.js";

export const LAYOUT = { width: 868, row: 56, cover: 48, textX: 64, dayColumn: 96 } as const;

const FONT = { variant: "text", weights: [400, 700] } as const;
const TITLE_CHARS = charsPerLine(LAYOUT.width - LAYOUT.textX - LAYOUT.dayColumn, 16);
const ARTIST_CHARS = charsPerLine(LAYOUT.width - LAYOUT.textX - LAYOUT.dayColumn, 13);

/** One line of text, cut with "…" when it doesn't fit. */
const oneLine = (s: string, max: number) => (s ? (wrapLines(s, max, 1)[0] ?? "") : "");

function cover(i: number, href: string | undefined, y: number, p: Palette): string {
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
```

- [ ] **Step 4: Run tests, lint, typecheck**

Run: `mise exec -- npx vitest run && mise exec -- npx biome check --write . && mise exec -- npx tsc --noEmit`
Expected: all PASS, clean.

- [ ] **Step 5: Commit**
```bash
git add -A && git commit -m "Render the recently-played neon card and fallback

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: `api/recent.ts`, `vercel.json` and a local Vercel build

**Files:**
- Create: `api/recent.ts`, `test/recent.test.ts`
- Modify: `vercel.json`

**Interfaces:**
- Consumes:
  - `fetchRecent`, `fetchCovers`, `HistoryError` (Task 2)
  - `renderRecent`, `renderFallback` (Task 3)
  - `resolveTz` (Task 1)
- Produces:
  - `interface Deps { fetchFn: typeof fetch; env: Record<string, string | undefined>; now: () => Date }`
  - `handle(request: Request, deps?: Partial<Deps>): Promise<Response>`
  - `GET(request: Request): Promise<Response>`
  - `CACHE_OK`, `CACHE_FAIL` (header strings)

- [ ] **Step 1: Write the failing test** `test/recent.test.ts`

```ts
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { CACHE_FAIL, CACHE_OK, handle } from "../api/recent.js";

const fixture = readFileSync(new URL("./fixtures/history.json", import.meta.url), "utf8");
const fetchFn = vi.fn(async (url: string | URL | Request) =>
	String(url).startsWith("https://api.music.yandex.net/")
		? new Response(fixture, { headers: { "content-type": "application/json" } })
		: new Response(new Uint8Array([1]), { headers: { "content-type": "image/jpeg" } }),
) as unknown as typeof fetch;
const now = () => new Date("2026-10-10T12:00:00Z");
const req = (q = "") => new Request(`https://example.vercel.app/api/recent${q}`);

describe("handle", () => {
	it("returns the card as cacheable SVG", async () => {
		const res = await handle(req(), { fetchFn, env: { YM_TOKEN: "t" }, now });
		expect(res.status).toBe(200);
		expect(res.headers.get("content-type")).toBe("image/svg+xml; charset=utf-8");
		expect(res.headers.get("cache-control")).toBe(CACHE_OK);
		const svg = await res.text();
		expect(svg).toContain("ПРИЛЕТЕЛА");
		expect(svg).toContain("#11111b"); // mocha panel
	});

	it("switches to Latte for theme=light and treats anything else as dark", async () => {
		const light = await (await handle(req("?theme=light"), { fetchFn, env: { YM_TOKEN: "t" }, now })).text();
		expect(light).toContain("#eff1f5");
		const odd = await (await handle(req("?theme=neon"), { fetchFn, env: { YM_TOKEN: "t" }, now })).text();
		expect(odd).toContain("#11111b");
	});

	it("serves an uncached fallback card on failure", async () => {
		const res = await handle(req(), { fetchFn, env: {}, now });
		expect(res.status).toBe(200);
		expect(res.headers.get("cache-control")).toBe(CACHE_FAIL);
		expect(await res.text()).toContain("no token");
	});

	it("never leaks the token or unexpected error text into the card", async () => {
		const boom = vi.fn(async () => {
			throw new Error("secret-ish detail");
		}) as unknown as typeof fetch;
		const svg = await (await handle(req(), { fetchFn: boom, env: { YM_TOKEN: "tok123" }, now })).text();
		expect(svg).toContain("bad response");
		expect(svg).not.toContain("tok123");
		expect(svg).not.toContain("secret-ish");
	});
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `mise exec -- npx vitest run test/recent.test.ts`
Expected: FAIL, because `../api/recent.js` can't be resolved.

- [ ] **Step 3: Implement** `api/recent.ts`

```ts
// GET /api/recent?theme=dark|light — the user's 5 most recently played Yandex Music
// tracks as a neon card. /api/nowplaying is rewritten here (vercel.json).
import { FLAVORS } from "@sm-steel/neon-kit";
import { resolveTz } from "../src/days.js";
import { fetchCovers, fetchRecent, HistoryError } from "../src/history.js";
import { renderFallback, renderRecent } from "../src/render.js";

export const CACHE_OK = "public, max-age=0, s-maxage=60, stale-while-revalidate=86400";
export const CACHE_FAIL = "no-store";

export interface Deps {
	fetchFn: typeof fetch;
	env: Record<string, string | undefined>;
	now: () => Date;
}

const svg = (body: string, cache: string) =>
	new Response(body, {
		status: 200,
		headers: { "Content-Type": "image/svg+xml; charset=utf-8", "Cache-Control": cache },
	});

export async function handle(request: Request, deps: Partial<Deps> = {}): Promise<Response> {
	const { fetchFn = fetch, env = process.env, now = () => new Date() } = deps;
	const p = new URL(request.url).searchParams.get("theme") === "light" ? FLAVORS.latte : FLAVORS.mocha;
	try {
		const tracks = await fetchRecent(env.YM_TOKEN, fetchFn);
		const covers = await fetchCovers(tracks, fetchFn);
		return svg(renderRecent(tracks, covers, p, resolveTz(env.WIDGET_TZ), now()), CACHE_OK);
	} catch (e) {
		// only our own reason strings reach the card, never raw error text
		const reason = e instanceof HistoryError ? e.reason : "bad response";
		return svg(renderFallback(reason, p), CACHE_FAIL);
	}
}

export function GET(request: Request): Promise<Response> {
	return handle(request);
}
```

- [ ] **Step 4: Replace** `vercel.json`

```json
{
	"functions": {
		"api/recent.ts": { "maxDuration": 15 }
	},
	"rewrites": [{ "source": "/api/nowplaying", "destination": "/api/recent" }]
}
```

- [ ] **Step 5: Run tests, lint, typecheck**

Run: `mise exec -- npx vitest run && mise exec -- npx biome check --write . && mise exec -- npx tsc --noEmit`
Expected: all PASS, clean.

- [ ] **Step 6: Prove that Vercel compiles it (local build, no deploy)**

Run: `mise exec -- npx vercel build --yes 2>&1 | tail -15`. The user's Vercel CLI is logged in, and `.vercel/project.json` links the project.
Expected: `Build Completed`, and `.vercel/output/functions/api/recent.func/` exists. If `vercel build` asks for project settings or environment (`vercel pull`), run `mise exec -- npx vercel pull --yes --environment=production` first. That writes `.vercel/.env.production.local`, which `.gitignore` covers via `.env*`. Never print it.

If the build fails on `.js` imports or TypeScript settings, that is the risk this step exists to catch. Debug with superpowers:systematic-debugging and record the fix as a ledger ruling.

- [ ] **Step 7: Commit**
```bash
git add -A && git commit -m "Add /api/recent handler and nowplaying alias

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Token script, deploy workflow and README

**Files:**
- Create: `scripts/get-token.ts`, `test/get-token.test.ts`
- Modify: `.github/workflows/deploy.yml`, `README.md`

**Interfaces:**
- Produces: `deviceLogin(opts: { fetchFn?: typeof fetch; sleep?: (ms: number) => Promise<void>; onCode: (url: string, code: string) => void }): Promise<string>`, which resolves to the access token.

- [ ] **Step 1: Write the failing test** `test/get-token.test.ts`

```ts
import { describe, expect, it, vi } from "vitest";
import { deviceLogin } from "../scripts/get-token.js";

const res = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

describe("deviceLogin", () => {
	it("shows the code, polls while pending, and returns the token", async () => {
		const fetchFn = vi
			.fn()
			.mockResolvedValueOnce(res({ device_code: "dc", user_code: "ABC-123", verification_url: "https://ya.ru/device", interval: 1, expires_in: 300 }))
			.mockResolvedValueOnce(res({ error: "authorization_pending" }, 400))
			.mockResolvedValueOnce(res({ access_token: "y0_secret", expires_in: 31536000 }));
		const onCode = vi.fn();
		const sleep = vi.fn(async () => {});
		const token = await deviceLogin({ fetchFn, sleep, onCode });
		expect(token).toBe("y0_secret");
		expect(onCode).toHaveBeenCalledWith("https://ya.ru/device", "ABC-123");
		expect(sleep).toHaveBeenCalledWith(1000);
		const [url, init] = fetchFn.mock.calls[2] as [string, RequestInit];
		expect(url).toBe("https://oauth.yandex.ru/token");
		expect(String(init.body)).toContain("grant_type=device_code");
	});

	it("fails clearly on denial", async () => {
		const fetchFn = vi
			.fn()
			.mockResolvedValueOnce(res({ device_code: "dc", user_code: "X", verification_url: "u", interval: 1, expires_in: 300 }))
			.mockResolvedValueOnce(res({ error: "access_denied" }, 400));
		await expect(deviceLogin({ fetchFn, sleep: async () => {}, onCode: () => {} })).rejects.toThrow(/access_denied/);
	});
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `mise exec -- npx vitest run test/get-token.test.ts`
Expected: FAIL, because the module can't be resolved.

- [ ] **Step 3: Implement** `scripts/get-token.ts`

```ts
// One-time helper: mints a Yandex Music OAuth token via Yandex's device-code login.
//   npx tsx scripts/get-token.ts             → prints the token (to this terminal only)
//   npx tsx scripts/get-token.ts --out FILE  → writes it to FILE instead of printing
// Then set it in Vercel: `vercel env add YM_TOKEN production`. Never commit it.
import { randomBytes } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

// Public client of the Yandex Music Android app (same as the yandex-music library uses).
const CLIENT_ID = "23cabbbdc6cd418abb4b39c32c41195d";
const CLIENT_SECRET = "53bc75238f0c4d08a118e51fe9203300";
const OAUTH = "https://oauth.yandex.ru";

interface DeviceCode {
	device_code: string;
	user_code: string;
	verification_url: string;
	interval: number;
	expires_in: number;
}

const form = (data: Record<string, string>) => ({
	method: "POST",
	headers: { "Content-Type": "application/x-www-form-urlencoded" },
	body: new URLSearchParams(data).toString(),
});

export async function deviceLogin(opts: {
	fetchFn?: typeof fetch;
	sleep?: (ms: number) => Promise<void>;
	onCode: (url: string, code: string) => void;
}): Promise<string> {
	const { fetchFn = fetch, sleep = (ms) => new Promise((r) => setTimeout(r, ms)), onCode } = opts;
	const codeRes = await fetchFn(
		`${OAUTH}/device/code`,
		form({ client_id: CLIENT_ID, device_id: randomBytes(8).toString("hex"), device_name: "neon widget" }),
	);
	if (!codeRes.ok) throw new Error(`device/code failed: HTTP ${codeRes.status}`);
	const code = (await codeRes.json()) as DeviceCode;
	onCode(code.verification_url, code.user_code);

	const deadline = Date.now() + code.expires_in * 1000;
	while (Date.now() < deadline) {
		await sleep(code.interval * 1000);
		const res = await fetchFn(
			`${OAUTH}/token`,
			form({ grant_type: "device_code", code: code.device_code, client_id: CLIENT_ID, client_secret: CLIENT_SECRET }),
		);
		const body = (await res.json()) as { access_token?: string; error?: string };
		if (res.ok && body.access_token) return body.access_token;
		if (body.error !== "authorization_pending") throw new Error(`login failed: ${body.error ?? `HTTP ${res.status}`}`);
	}
	throw new Error("login timed out: the code expired");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
	const outIndex = process.argv.indexOf("--out");
	const out = outIndex > 0 ? process.argv[outIndex + 1] : undefined;
	const token = await deviceLogin({
		onCode: (url, c) => console.log(`Open ${url} and enter code: ${c}`),
	});
	if (out) {
		await writeFile(out, token, { mode: 0o600 });
		console.log(`Token written to ${out}`);
	} else {
		console.log(`\nYM_TOKEN: ${token}\n\nSet it in Vercel (vercel env add YM_TOKEN production). Never commit it.`);
	}
}
```

- [ ] **Step 4: Run tests**

Run: `mise exec -- npx vitest run && mise exec -- npx biome check --write . && mise exec -- npx tsc --noEmit`
Expected: all PASS, clean.

- [ ] **Step 5: Update** `.github/workflows/deploy.yml`. Replace the `steps:` list with:

```yaml
    steps:
      - uses: actions/checkout@v7
      - uses: jdx/mise-action@v5
      - run: npm ci
      - run: npm test
      - name: Install Vercel CLI
        run: npm install --global vercel@latest
      - name: Pull Vercel environment info
        run: vercel pull --yes --environment=production --token=${{ secrets.VERCEL_TOKEN }}
      - name: Build project artifacts
        run: vercel build --prod --token=${{ secrets.VERCEL_TOKEN }}
      - name: Deploy to Vercel
        run: vercel deploy --prebuilt --prod --token=${{ secrets.VERCEL_TOKEN }}
```

Leave `name`, `on` and the `env` block (`VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`) unchanged.

- [ ] **Step 6: Rewrite** `README.md`. Keep it short and cover these points:
- **Title and intro:** `# ym-nowplaying-widget`, then one paragraph: "The 5 tracks you most recently played on Yandex Music, as an animated neon SVG card for your GitHub profile. Built with [@sm-steel/neon-kit](https://github.com/sm-steel/neon-kit)."
- **Usage:** the `<picture>` snippet for `https://ym-nowplaying-widget.vercel.app/api/recent?theme=dark|light`, plus a note that `/api/nowplaying` still works as an alias.
- **Env vars:** `YM_TOKEN` (required) and `WIDGET_TZ` (optional, IANA zone, default `Europe/Moscow`, used for "today/yesterday").
- **Getting a token:** `npm run token`, or `npx tsx scripts/get-token.ts --out <file>`, then `vercel env add YM_TOKEN production`. Never commit it.
- **Caching:** 60s at the CDN, stale-while-revalidate for a day. Errors render a "SIGNAL LOST" card that is never cached.
- **Development:** `mise install && npm ci`, `npm test`, `npm run preview`.

- [ ] **Step 7: Commit**
```bash
git add -A && git commit -m "TypeScript token helper, Node deploy workflow, README

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Local preview and the **preview gate**

**Files:**
- Create: `scripts/preview.ts`

**Interfaces:**
- Consumes: `handle` (Task 4).
- Produces: `preview/out/{recent-dark,recent-light,fallback-dark,fallback-light}.svg` and `preview/out/index.html`, served at `http://127.0.0.1:8768/` with `--serve`.

- [ ] **Step 1: Write** `scripts/preview.ts`

```ts
// Local preview: renders the real card (needs YM_TOKEN or --token-file FILE) and a
// fallback card in both themes, shown on GitHub's dark/light backgrounds.
//   npx tsx scripts/preview.ts [--token-file FILE] [--serve]   → http://127.0.0.1:8768/
import { createReadStream } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join } from "node:path";
import { handle } from "../api/recent.js";

const OUT = "preview/out";
await mkdir(OUT, { recursive: true });

const tokenFileAt = process.argv.indexOf("--token-file");
const token =
	tokenFileAt > 0
		? (await readFile(process.argv[tokenFileAt + 1] as string, "utf8")).trim()
		: process.env.YM_TOKEN;
const env = { YM_TOKEN: token, WIDGET_TZ: process.env.WIDGET_TZ };

for (const theme of ["dark", "light"]) {
	const req = new Request(`http://localhost/api/recent?theme=${theme}`);
	await writeFile(join(OUT, `recent-${theme}.svg`), await (await handle(req, { env })).text());
	await writeFile(join(OUT, `fallback-${theme}.svg`), await (await handle(req, { env: {} })).text());
}
const img = (f: string) => `<img src="${f}" style="width:min(100%,830px);display:block;margin:12px auto">`;
await writeFile(
	join(OUT, "index.html"),
	`<!doctype html><meta charset="utf-8"><title>recently played preview</title>
<body style="margin:0"><div style="background:#0d1117;padding:16px">${img("recent-dark.svg")}${img("fallback-dark.svg")}</div>
<div style="background:#fff;padding:16px">${img("recent-light.svg")}${img("fallback-light.svg")}</div></body>`,
);
console.log(`preview: ${OUT}/index.html${token ? "" : " (no token: real card shows the fallback)"}`);

if (process.argv.includes("--serve")) {
	const root = join(OUT);
	createServer((req, res) => {
		let path: string;
		try {
			path = decodeURIComponent((req.url ?? "/").split("?")[0] as string);
		} catch {
			return void res.writeHead(400).end();
		}
		const file = join(root, path === "/" ? "index.html" : path);
		if (!file.startsWith(root)) return void res.writeHead(403).end();
		res.setHeader("Content-Type", extname(file) === ".svg" ? "image/svg+xml" : "text/html; charset=utf-8");
		createReadStream(file).on("error", () => res.writeHead(404).end()).pipe(res);
	}).listen(8768, "127.0.0.1", () => console.log("serving http://127.0.0.1:8768/"));
}
```

- [ ] **Step 2: Typecheck and lint**

Run: `mise exec -- npx tsc --noEmit && mise exec -- npx biome check --write .`
Expected: clean.

- [ ] **Step 3: USER ACTION — mint a fresh token into the session temp folder**

Ask the user to run this in their **own separate terminal** (not `! …`), so the token never enters the chat:
```powershell
cd ~\src\ym-nowplaying-widget
npx tsx scripts/get-token.ts --out "C:\Users\smste\AppData\Local\Temp\claude\C--Users-smste-src-sm-steel\d6529004-8926-4ea8-950e-a98128028280\scratchpad\ym_token"
```
They follow the device-code link and say "done". Check that the file exists **without printing it**.

- [ ] **Step 4: Render and serve**

Run in the background: `mise exec -- npx tsx scripts/preview.ts --token-file "C:\Users\smste\AppData\Local\Temp\claude\C--Users-smste-src-sm-steel\d6529004-8926-4ea8-950e-a98128028280\scratchpad\ym_token" --serve`.
Then grab headless-Chromium frames (separate `--user-data-dir`, `--virtual-time-budget=6000`) and read them yourself. Check:
- 5 rows with covers;
- the newest title in accent;
- day labels right-aligned;
- the Cyrillic title in Monaspace;
- the fallback reads `// SIGNAL LOST · no token`.

- [ ] **Step 5: PREVIEW GATE — stop for the user's approval**

The user opens `http://127.0.0.1:8768/` in their own browser. Iterate on their feedback. **Do not continue to Task 7 without explicit approval.**

- [ ] **Step 6: Commit**
```bash
git add -A && git commit -m "Add local preview script

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Deploy and switch the profile (**user-confirmed**)

- [ ] **Step 1:** Run the full suite, lint and typecheck one final time and confirm all are green. Then, with the user's go-ahead:

```bash
git switch main && git merge --ff-only feat/recent-ts && git push origin main && git branch -d feat/recent-ts
```

- [ ] **Step 2:** Watch the deploy workflow: `gh run watch $(gh run list -w deploy.yml -L1 --json databaseId -q '.[0].databaseId') --exit-status`. Expected: success.

- [ ] **Step 3: Verify the live endpoints.** Print only status, content type and cache headers, never the body.
```bash
for u in "api/recent?theme=dark" "api/recent?theme=light" "api/nowplaying?theme=dark"; do
  curl -s -D - -o "$TEMP/ym.svg" "https://ym-nowplaying-widget.vercel.app/$u" | grep -iE '^(HTTP|content-type|cache-control)'
  grep -c 'RECENTLY PLAYED' "$TEMP/ym.svg"; grep -c 'SIGNAL LOST' "$TEMP/ym.svg"
done
```
Expected: `200`, `image/svg+xml`, and `s-maxage=60` (not `no-store`). Each body contains `RECENTLY PLAYED` and no `SIGNAL LOST`. If it shows `SIGNAL LOST · yandex 401`, the production `YM_TOKEN` is the old Ynison-era token, so ask the user to set a fresh one with `vercel env add YM_TOKEN production`. Don't touch Vercel env yourself.

- [ ] **Step 4: With the user's go-ahead, update the `sm-steel` README.**
- In both `<source>` URLs and the `<img>`, replace `api/nowplaying?theme=` with `api/recent?theme=`.
- Change the alt text to `Yandex Music recently played`.
- Commit, push, then check the profile in both themes with headless screenshots.

- [ ] **Step 5: Clean up.** Delete `C:\Users\smste\AppData\Local\Temp\claude\C--Users-smste-src-sm-steel\d6529004-8926-4ea8-950e-a98128028280\scratchpad\ym_token`, stop the preview server, and remind the user they can revoke this dev token whenever they like. The production token in Vercel is separate.
