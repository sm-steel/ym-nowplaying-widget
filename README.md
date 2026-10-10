# ym-nowplaying-widget

The 5 tracks you most recently played on Yandex Music, as an animated neon SVG card for your GitHub profile. Built with [@sm-steel/neon-kit](https://github.com/sm-steel/neon-kit) and served from a Vercel function.

## Usage

```html
<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://ym-nowplaying-widget.vercel.app/api/recent?theme=dark" />
  <source media="(prefers-color-scheme: light)" srcset="https://ym-nowplaying-widget.vercel.app/api/recent?theme=light" />
  <img alt="Yandex Music recently played" src="https://ym-nowplaying-widget.vercel.app/api/recent?theme=dark" width="100%" />
</picture>
```

Each row shows the cover, the title (the newest one highlighted), the artists, and the day it was played (`today`, `yesterday`, `Oct 8`). Yandex's history only records days, not times. The old `/api/nowplaying` URL still works as an alias.

## Configuration

| Env var | | |
|---|---|---|
| `YM_TOKEN` | required | Yandex Music OAuth token |
| `WIDGET_TZ` | optional | IANA timezone used for "today/yesterday" (default `Europe/Moscow`) |

### Getting a token

```sh
npm run token                                 # prints the token in your terminal
npx tsx scripts/get-token.ts --out <file>     # or writes it to a file
vercel env add YM_TOKEN production
```

The script uses Yandex's device-code login: open the link it prints and enter the code. **Never commit the token.** The repo's `.gitignore` refuses files named `y0_*` or `token*.txt`.

## Caching and errors

Cards are cached for 60s at the CDN and served stale for up to a day while refreshing, so GitHub's image proxy never waits on Yandex. When something goes wrong (no token, Yandex error, timeout, no history), the endpoint still returns a card that reads `// SIGNAL LOST · <reason>`, and that card is never cached.

## Development

Tools are pinned with [mise](https://mise.jdx.dev): `mise install && npm ci`.

- `npm test`, `npm run lint`, `npm run typecheck`
- `npm run preview` renders the card locally (pass `--token-file <file>` for real data) at http://127.0.0.1:8768/
- Pushing to `main` deploys to Vercel via `.github/workflows/deploy.yml`.
