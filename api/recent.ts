// GET /api/recent?theme=dark|light — the user's 5 most recently played Yandex Music
// tracks as a neon card. /api/nowplaying is rewritten here (vercel.json).
import { FLAVORS } from "@sm-steel/neon-kit";
import { resolveTz } from "../src/days.js";
import { fetchCovers, fetchRecent, HistoryError } from "../src/history.js";
import { renderFallback, renderRecent } from "../src/render.js";

export const CACHE_OK =
	"public, max-age=0, s-maxage=60, stale-while-revalidate=86400";
export const CACHE_FAIL = "no-store";

export interface Deps {
	fetchFn: typeof fetch;
	env: Record<string, string | undefined>;
	now: () => Date;
}

const svg = (body: string, cache: string) =>
	new Response(body, {
		status: 200,
		headers: {
			"Content-Type": "image/svg+xml; charset=utf-8",
			"Cache-Control": cache,
		},
	});

export async function handle(
	request: Request,
	deps: Partial<Deps> = {},
): Promise<Response> {
	const { fetchFn = fetch, env = process.env, now = () => new Date() } = deps;
	const p =
		new URL(request.url).searchParams.get("theme") === "light"
			? FLAVORS.latte
			: FLAVORS.mocha;
	try {
		const tracks = await fetchRecent(env.YM_TOKEN, fetchFn);
		const covers = await fetchCovers(tracks, fetchFn);
		return svg(
			renderRecent(tracks, covers, p, resolveTz(env.WIDGET_TZ), now()),
			CACHE_OK,
		);
	} catch (e) {
		// only our own reason strings reach the card, never raw error text
		const reason = e instanceof HistoryError ? e.reason : "bad response";
		return svg(renderFallback(reason, p), CACHE_FAIL);
	}
}

export function GET(request: Request): Promise<Response> {
	return handle(request);
}
