# @midscene/badge

A Cloudflare Worker that renders Midscene Test results as an SVG badge for
Markdown.

```md
![Midscene Test](https://<your-domain>/badge.svg?pass=42&fail=3)
```

## Query parameters

| Param   | Required | Values                                   |
| ------- | -------- | ---------------------------------------- |
| `pass`  | yes      | integer, 0 – 9999999                     |
| `fail`  | yes      | integer, 0 – 9999999                     |
| `style` | no       | `flat` (default, 20px), `large` (28px), `card` (two lines) |
| `theme` | no       | `light` (default) or `dark`, only for `card` |

Invalid parameters return `400` with a plain-text reason.

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
pnpm --filter @midscene/badge deploy     # requires `wrangler login`
```

The logo is embedded as base64 PNGs because GitHub camo blocks external
resources inside SVG images. `assets/logo-*.png` are downscaled copies of
`apps/site/docs/public/images/brand/midscene-icon.png`. After replacing them,
run `pnpm --filter @midscene/badge generate-logo` to regenerate `src/logo.ts`.
