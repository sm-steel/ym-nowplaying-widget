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

export type Reason =
	| "no token"
	| "no recent tracks"
	| "timeout"
	| "bad response"
	| `yandex ${number}`;

export class HistoryError extends Error {
	constructor(readonly reason: Reason) {
		super(reason);
		this.name = "HistoryError";
	}
}

const HISTORY_URL =
	"https://api.music.yandex.net/music-history?fullModelsCount=15";

interface FullModel {
	title?: unknown;
	artists?: { name?: unknown }[];
	coverUri?: unknown;
}

interface Tab {
	date?: unknown;
	items?: { tracks?: { data?: { fullModel?: FullModel } }[] }[];
}

/** The first `limit` tracks with full metadata, newest first. */
export function parseHistory(json: unknown, limit = 5): Track[] {
	const tabs = (json as { result?: { historyTabs?: unknown } })?.result
		?.historyTabs;
	if (!Array.isArray(tabs)) throw new HistoryError("bad response");
	const tracks: Track[] = [];
	for (const tab of tabs as Tab[]) {
		for (const item of tab.items ?? []) {
			for (const t of item.tracks ?? []) {
				const m = t.data?.fullModel;
				if (!m || typeof m.title !== "string" || typeof tab.date !== "string")
					continue;
				tracks.push({
					title: m.title,
					artists: (m.artists ?? [])
						.map((a) => a.name)
						.filter((n): n is string => typeof n === "string" && n !== "")
						.join(", "),
					cover:
						typeof m.coverUri === "string"
							? `https://${m.coverUri.replace("%%", "100x100")}`
							: undefined,
					date: tab.date,
				});
				if (tracks.length === limit) return tracks;
			}
		}
	}
	if (tracks.length === 0) throw new HistoryError("no recent tracks");
	return tracks;
}

const isTimeout = (e: unknown) =>
	e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError");

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
				const res = await fetchFn(t.cover, {
					signal: AbortSignal.timeout(timeoutMs),
				});
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
