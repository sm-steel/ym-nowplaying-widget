import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import {
	fetchCovers,
	fetchRecent,
	HistoryError,
	parseHistory,
} from "../src/history.js";

const fixture = JSON.parse(
	readFileSync(new URL("./fixtures/history.json", import.meta.url), "utf8"),
);
const json = (body: unknown, status = 200) =>
	vi.fn(
		async () =>
			new Response(JSON.stringify(body), {
				status,
				headers: { "content-type": "application/json" },
			}),
	);

describe("parseHistory", () => {
	it("takes the first 5 tracks that have a full model, in order, with their tab date", () => {
		const tracks = parseHistory(fixture);
		expect(tracks.map((t) => t.title)).toEqual([
			"ПРИЛЕТЕЛА",
			"Awakening",
			"Go",
			"victory lap",
			"Hard Feelings",
		]);
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
		expect(() => parseHistory({ result: { historyTabs: [] } })).toThrow(
			/no recent tracks/,
		);
	});
});

describe("fetchRecent", () => {
	it("requests 15 entries with the OAuth header", async () => {
		const fetchFn = json(fixture);
		await fetchRecent("tok", fetchFn);
		const [url, init] = fetchFn.mock.calls[0] as unknown as [
			string,
			RequestInit,
		];
		expect(url).toBe(
			"https://api.music.yandex.net/music-history?fullModelsCount=15",
		);
		expect((init.headers as Record<string, string>).Authorization).toBe(
			"OAuth tok",
		);
	});
	it("maps failures to reasons", async () => {
		await expect(fetchRecent(undefined, json(fixture))).rejects.toMatchObject({
			reason: "no token",
		});
		await expect(fetchRecent("t", json({}, 401))).rejects.toMatchObject({
			reason: "yandex 401",
		});
		const bad = vi.fn(async () => new Response("<html>", { status: 200 }));
		await expect(fetchRecent("t", bad)).rejects.toMatchObject({
			reason: "bad response",
		});
		const slow = vi.fn(async (_u: unknown, init?: RequestInit) => {
			init?.signal?.throwIfAborted();
			throw Object.assign(new Error("aborted"), { name: "TimeoutError" });
		});
		await expect(fetchRecent("t", slow, 1)).rejects.toMatchObject({
			reason: "timeout",
		});
	});
});

describe("fetchCovers", () => {
	it("embeds covers as data URIs and leaves failures empty (Review Focus 4)", async () => {
		const tracks = parseHistory(fixture).slice(0, 3);
		const fetchFn = vi.fn(async (url: string | URL | Request) => {
			const u = String(url);
			if (u.includes("/1/"))
				return new Response(new Uint8Array([1, 2, 3]), {
					headers: { "content-type": "image/jpeg" },
				});
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
		const covers = await fetchCovers(
			[{ title: "x", artists: "", date: "2026-10-10" }],
			fetchFn,
		);
		expect(covers).toEqual([undefined]);
		expect(fetchFn).not.toHaveBeenCalled();
	});
	it("rejects non-image responses", async () => {
		const fetchFn = vi.fn(
			async () =>
				new Response("<html>", { headers: { "content-type": "text/html" } }),
		);
		const [cover] = await fetchCovers(
			parseHistory(fixture).slice(0, 1),
			fetchFn,
		);
		expect(cover).toBeUndefined();
	});
});
