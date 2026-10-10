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
	const {
		fetchFn = fetch,
		sleep = (ms) => new Promise((r) => setTimeout(r, ms)),
		onCode,
	} = opts;
	const codeRes = await fetchFn(
		`${OAUTH}/device/code`,
		form({
			client_id: CLIENT_ID,
			device_id: randomBytes(8).toString("hex"),
			device_name: "neon widget",
		}),
	);
	if (!codeRes.ok)
		throw new Error(`device/code failed: HTTP ${codeRes.status}`);
	const code = (await codeRes.json()) as DeviceCode;
	onCode(code.verification_url, code.user_code);

	const deadline = Date.now() + code.expires_in * 1000;
	while (Date.now() < deadline) {
		await sleep(code.interval * 1000);
		const res = await fetchFn(
			`${OAUTH}/token`,
			form({
				grant_type: "device_code",
				code: code.device_code,
				client_id: CLIENT_ID,
				client_secret: CLIENT_SECRET,
			}),
		);
		const body = (await res.json()) as {
			access_token?: string;
			error?: string;
		};
		if (res.ok && body.access_token) return body.access_token;
		if (body.error !== "authorization_pending")
			throw new Error(`login failed: ${body.error ?? `HTTP ${res.status}`}`);
	}
	throw new Error("login timed out: the code expired");
}

if (
	process.argv[1] &&
	import.meta.url === pathToFileURL(process.argv[1]).href
) {
	const outIndex = process.argv.indexOf("--out");
	const out = outIndex > 0 ? process.argv[outIndex + 1] : undefined;
	const token = await deviceLogin({
		onCode: (url, c) => console.log(`Open ${url} and enter code: ${c}`),
	});
	if (out) {
		await writeFile(out, token, { mode: 0o600 });
		console.log(`Token written to ${out}`);
	} else {
		console.log(
			`\nYM_TOKEN: ${token}\n\nSet it in Vercel (vercel env add YM_TOKEN production). Never commit it.`,
		);
	}
}
