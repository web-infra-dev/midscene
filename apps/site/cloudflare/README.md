# Apex redirects

`redirects.mjs` manages three ordered Cloudflare Single Redirect rules for
`midscenejs.com`. Every redirect uses HTTP 301, targets HTTPS `www.midscenejs.com`,
and preserves the query string.

- Mainland China (`ip.src.country eq "CN"`): `/` → `/zh/` and documentation
  paths → `/zh` + original path. Existing `/zh/` paths stay localized.
- `/zh` → `/zh/` directly, in every region, avoiding the site's trailing-slash hop.
- Other traffic keeps its original path. Shared `/images/` and `/static/` assets
  and root metadata files are excluded from language changes.

The rules match only the apex hostname. They do not change behavior on `www`,
other subdomains, or Pages preview hosts. Existing retired-page redirects in
`docs/public/_redirects` continue to run separately; those URLs may still need
another redirect to their replacement page.

## Deployment

The `Site redirects` workflow validates pull requests and deploys after changes
merge to `main`. It can also be run manually on `main`.

Configure the repository before merging:

- Variable `CLOUDFLARE_ZONE_ID`: the zone ID for `midscenejs.com`.
- Secret `CLOUDFLARE_API_TOKEN`: must allow reading zone rulesets and editing
  Single Redirects for this zone. The existing Pages deployment token might
  need additional permissions.
- Apex DNS must be proxied through Cloudflare. Both apex and `www` must already
  have working TLS and DNS. The script does not modify DNS or TLS settings.

`deploy.mjs` creates the redirect phase entry point if absent. Otherwise, it
upserts only the three stable `midscene_apex_*` refs and places them before
existing rules, preserving unrelated rules and their relative order. This is
necessary to bypass an existing China geo redirect on the apex. The script
reads back the rules and checks their definitions and priority after writing.
Concurrent manual dashboard edits should be avoided during deployment.

For a manual deployment, supply the two environment variables above and run:

```sh
node apps/site/cloudflare/deploy.mjs
```

After deployment, verify response `Location` and status from both mainland
China and another region. Setting a client `CF-IPCountry` header does not
simulate Cloudflare's `ip.src.country`. China requests to `/` should respond
with `301 Location: https://www.midscenejs.com/zh/` immediately.

References: [Single Redirects API](https://developers.cloudflare.com/rules/url-forwarding/single-redirects/create-api/),
[rule ordering](https://developers.cloudflare.com/ruleset-engine/rulesets-api/update-rule/).
