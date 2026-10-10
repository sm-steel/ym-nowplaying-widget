// Local preview: renders the real card (needs YM_TOKEN or --token-file FILE) and a
// fallback card in both themes, shown on GitHub's dark/light backgrounds.
//   npx tsx scripts/preview.ts [--token-file FILE] [--serve]   → http://127.0.0.1:8768/
import { createReadStream } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, sep } from "node:path";
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
	await writeFile(
		join(OUT, `recent-${theme}.svg`),
		await (await handle(req, { env })).text(),
	);
	await writeFile(
		join(OUT, `fallback-${theme}.svg`),
		await (await handle(req, { env: {} })).text(),
	);
}
const img = (f: string) =>
	`<img src="${f}" style="width:min(100%,830px);display:block;margin:12px auto">`;
await writeFile(
	join(OUT, "index.html"),
	`<!doctype html><meta charset="utf-8"><title>recently played preview</title>
<body style="margin:0"><div style="background:#0d1117;padding:16px">${img("recent-dark.svg")}${img("fallback-dark.svg")}</div>
<div style="background:#fff;padding:16px">${img("recent-light.svg")}${img("fallback-light.svg")}</div></body>`,
);
console.log(
	`preview: ${OUT}/index.html${token ? "" : " (no token: real card shows the fallback)"}`,
);

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
		if (!file.startsWith(root + sep)) return void res.writeHead(403).end();
		res.setHeader(
			"Content-Type",
			extname(file) === ".svg" ? "image/svg+xml" : "text/html; charset=utf-8",
		);
		createReadStream(file)
			.on("error", () => res.writeHead(404).end())
			.pipe(res);
	}).listen(8768, "127.0.0.1", () =>
		console.log("serving http://127.0.0.1:8768/"),
	);
}
