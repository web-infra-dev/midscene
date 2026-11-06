# @midscene/badge

A Cloudflare Worker that renders Midscene Test results as an SVG badge for
Markdown.

```md
![Midscene Test](https://<your-domain>/e2e?pass=42&fail=3)
```

## Query parameters

| Param   | Required | Values                                   |
| ------- | -------- | ---------------------------------------- |
| `pass`  | yes      | integer, 0 – 9999999                     |
| `fail`  | yes      | integer, 0 – 9999999                     |
| `style` | no       | `flat` (default, 20px), `large` (28px), `card` (two lines) |
| `theme` | no       | `light` (default) or `dark`, only for `card` |

Invalid parameters return `400` with a plain-text reason.

## E2E by Midscene.js

A static attribution badge that needs no counts:

```md
[![E2E by Midscene.js](https://<your-domain>/by-midscene)](https://midscenejs.com)
```

`style` is optional: `flat` (default, 20px) or `large` (28px).

## Caching

The design rarely changes, so responses are cached aggressively:

- `Cache-Control: public, max-age=86400, s-maxage=86400` for browsers and
  proxies such as GitHub camo.
- Cloudflare edge cache via `caches.default`, keyed on the normalized
  parameters, so `?fail=3&pass=42` and `?pass=42&fail=3&style=flat` share
  one entry.
- A deterministic `ETag`, so revalidation returns `304`.

When the badge design changes, bump `BADGE_VERSION` in `src/badge.ts`. The
edge cache picks up the new design right after deploy. Clients that already
cached the badge keep the old one for up to 24h.

## Development

```bash
pnpm --filter @midscene/badge dev        # wrangler dev on http://localhost:8787
npx nx test @midscene/badge
pnpm --filter @midscene/badge typecheck
```

The logo is embedded as a base64 PNG because GitHub camo blocks external
resources inside SVG images. `assets/logo-96.png` is a downscaled copy of
`apps/site/docs/public/images/brand/midscene-icon.png`. After replacing it,
run `pnpm --filter @midscene/badge generate-logo` to regenerate `src/logo.ts`.

## Deployment

Production is deployed by `.github/workflows/badge.yml`, not from a local
checkout. Pull requests run tests, type checking, and a Worker bundle dry run.
Relevant changes merged into `main` deploy automatically; the **Badge service**
workflow also supports **Run workflow** on `main`. Other branches only validate.

The workflow uses the dedicated repository secret `CLOUDFLARE_BADGE_API_TOKEN` and
variable `CLOUDFLARE_ACCOUNT_ID`. The badge token is independent of the report
publishing token.
The token must allow Workers script deployment and custom-domain management
for the Web Infra account and the `midscenejs.com` zone; a Pages-only token is
not sufficient. Do not use a developer's Wrangler OAuth credentials in CI.

Wrangler manages the `midscene-badge` Worker and its `badge.midscenejs.com`
custom domain from `wrangler.jsonc`. The deployment checks both the homepage
and `/e2e` endpoint after publishing.
