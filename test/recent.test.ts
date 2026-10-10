import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { CACHE_FAIL, CACHE_OK, handle } from "../api/recent.js";

const fixture = readFileSync(
	new URL("./fixtures/history.json", import.meta.url),
	"utf8",
);
const fetchFn = vi.fn(async (url: string | URL | Request) =>
	String(url).startsWith("https://api.music.yandex.net/")
		? new Response(fixture, { headers: { "content-type": "application/json" } })
		: new Response(new Uint8Array([1]), {
				headers: { "content-type": "image/jpeg" },
			}),
) as unknown as typeof fetch;
const now = () => new Date("2026-10-10T12:00:00Z");
const req = (q = "") =>
	new Request(`https://example.vercel.app/api/recent${q}`);

describe("handle", () => {
	it("returns the card as cacheable SVG", async () => {
		const res = await handle(req(), { fetchFn, env: { YM_TOKEN: "t" }, now });
		expect(res.status).toBe(200);
		expect(res.headers.get("content-type")).toBe(
			"image/svg+xml; charset=utf-8",
		);
		expect(res.headers.get("cache-control")).toBe(CACHE_OK);
		const svg = await res.text();
		expect(svg).toContain("ПРИЛЕТЕЛА");
		expect(svg).toContain("#11111b"); // mocha panel
	});

	it("switches to Latte for theme=light and treats anything else as dark", async () => {
		const light = await (
			await handle(req("?theme=light"), {
				fetchFn,
				env: { YM_TOKEN: "t" },
				now,
			})
		).text();
		expect(light).toContain("#eff1f5");
		const odd = await (
			await handle(req("?theme=neon"), {
				fetchFn,
				env: { YM_TOKEN: "t" },
				now,
			})
		).text();
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
		const svg = await (
			await handle(req(), {
				fetchFn: boom,
				env: { YM_TOKEN: "tok123" },
				now,
			})
		).text();
		expect(svg).toContain("bad response");
		expect(svg).not.toContain("tok123");
		expect(svg).not.toContain("secret-ish");
	});
});
