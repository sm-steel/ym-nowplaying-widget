export const DEFAULT_TZ = "Europe/Moscow";

const MONTHS = [
	"Jan",
	"Feb",
	"Mar",
	"Apr",
	"May",
	"Jun",
	"Jul",
	"Aug",
	"Sep",
	"Oct",
	"Nov",
	"Dec",
];

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
	return new Intl.DateTimeFormat("en-CA", {
		timeZone: tz,
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
	}).format(now);
}

/** "today", "yesterday", or "Mon D" for a history tab date (YYYY-MM-DD) as seen in `tz`. */
export function dayLabel(
	date: string,
	tz: string,
	now: Date = new Date(),
): string {
	const today = isoDay(now, tz);
	if (date === today) return "today";
	const [y, m, d] = today.split("-").map(Number) as [number, number, number];
	const yesterday = new Date(Date.UTC(y, m - 1, d - 1))
		.toISOString()
		.slice(0, 10);
	if (date === yesterday) return "yesterday";
	const [, mm, dd] = date.split("-").map(Number) as [number, number, number];
	return `${MONTHS[mm - 1]} ${dd}`;
}
