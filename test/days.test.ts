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
		expect(
			dayLabel("2026-12-31", "UTC", new Date("2027-01-01T12:00:00Z")),
		).toBe("yesterday");
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
