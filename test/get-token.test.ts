import { describe, expect, it, vi } from "vitest";
import { deviceLogin, outPath } from "../scripts/get-token.js";

const res = (body: unknown, status = 200) =>
	new Response(JSON.stringify(body), { status });

describe("deviceLogin", () => {
	it("shows the code, polls while pending, and returns the token", async () => {
		const fetchFn = vi
			.fn()
			.mockResolvedValueOnce(
				res({
					device_code: "dc",
					user_code: "ABC-123",
					verification_url: "https://ya.ru/device",
					interval: 1,
					expires_in: 300,
				}),
			)
			.mockResolvedValueOnce(res({ error: "authorization_pending" }, 400))
			.mockResolvedValueOnce(
				res({ access_token: "y0_secret", expires_in: 31536000 }),
			);
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
			.mockResolvedValueOnce(
				res({
					device_code: "dc",
					user_code: "X",
					verification_url: "u",
					interval: 1,
					expires_in: 300,
				}),
			)
			.mockResolvedValueOnce(res({ error: "access_denied" }, 400));
		await expect(
			deviceLogin({ fetchFn, sleep: async () => {}, onCode: () => {} }),
		).rejects.toThrow(/access_denied/);
	});
});

describe("outPath", () => {
	it("returns the --out file, or undefined when the flag is absent", () => {
		expect(outPath(["node", "get-token.ts", "--out", "t.txt"])).toBe("t.txt");
		expect(outPath(["node", "get-token.ts"])).toBeUndefined();
	});

	it("refuses --out without a path instead of printing the token", () => {
		expect(() => outPath(["node", "get-token.ts", "--out"])).toThrow(/--out/);
		expect(() => outPath(["node", "get-token.ts", "--out", "--x"])).toThrow(
			/--out/,
		);
	});
});
