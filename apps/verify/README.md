# Midscene Verify (experimental)

A runnable GitHub App prototype for Web PR acceptance testing. It consumes PR and deployment events, runs Midscene `aiAct` / `aiAssert` against a preview, produces JSON, Markdown, HTML and evidence, and publishes `Midscene / Functional Verification`.

[中文接入说明](./README.zh.md)

## Requirements

Use Node.js 24 and pnpm >=9.3, built `@midscene/web` dependencies, an accessible Chrome installation, a configured visual model, a GitHub App, an HTTPS webhook endpoint and persistent storage.

Deployment SHA must equal the complete PR head SHA. Its environment must match the configured environment, and its latest successful status must provide `environment_url`. The preview must expose a build-generated JSON revision endpoint returning `{"sha":"<40-character-commit-sha>"}`. Do not hardcode the expected SHA into that endpoint.

This version tests PR heads, not merge candidates or merge queues. It does not check out PR code or merge PRs.

## GitHub App setup

Create an App with Checks read/write, Pull requests read/write, Deployments read and GitHub's mandatory Metadata access. Subscribe to `pull_request`, `deployment_status`, and `check_run`. Set its webhook to `https://your-service/webhooks/github`, configure a random webhook secret, generate a private key outside the repository, and install it on a test repository.

References: [signature validation](https://docs.github.com/en/webhooks/using-webhooks/validating-webhook-deliveries), [Checks API](https://docs.github.com/en/rest/checks/runs), [Deployments API](https://docs.github.com/en/rest/deployments/deployments).

Copy `config.example.json` outside the repository and configure the installation ID, repository, deployment environment, exact allowed origins, revision endpoint and criteria. All criteria are required and must end in `aiAssert`. Policies are operator-controlled, never read from a PR. Dynamic preview origins require a configuration update and restart in this prototype. Each criterion navigates to its own path; browser session and application data remain shared within a run. Use dedicated repeatable test data.

Set these environment variables:

| Variable | Value |
| --- | --- |
| `VERIFY_CONFIG` | Absolute JSON configuration path |
| `VERIFY_DATA_DIR` | Persistent directory outside the checkout |
| `VERIFY_PUBLIC_URL` | Plain HTTPS origin |
| `GITHUB_APP_ID` | App ID |
| `GITHUB_APP_PRIVATE_KEY_FILE` | Private PEM file outside the checkout |
| `GITHUB_WEBHOOK_SECRET` | Random secret, at least 32 characters |
| `MIDSCENE_MODEL_NAME` / `MIDSCENE_MODEL_FAMILY` | Model identity |
| `MIDSCENE_MODEL_BASE_URL` / `MIDSCENE_MODEL_API_KEY` | Model endpoint and credential |
| `PUPPETEER_EXECUTABLE_PATH` | Optional Chrome executable |
| `HOST` / `PORT` | Defaults to `127.0.0.1:4319` |

```bash
pnpm --filter @midscene/verify start
```

Deploy one instance per data directory behind an HTTPS reverse proxy. Monitor health and failed deliveries. `service.lock` prevents concurrent owners; after an abnormal exit, verify the old PID is gone before handling the stale lock. Never remove an active lock.

On development machines, respect the shared resource gate. A persistent service consumes a service slot and browser execution requires a runtime slot; do not run automatic browser jobs under only a service allocation. Use the short-lived browser smoke command locally, or host the App on a separate execution machine.

## PR result comments

After evidence and the Check are published, the App posts a new PR conversation comment for that verification. It includes the exact commit, functional result, execution status, criterion results, report links, and a machine-readable JSON summary. Hosted runs also link to their GitHub Actions artifacts so reviewers can download evidence using GitHub access. Reports, screenshots, traces and JSON evidence are publicly readable without a password.

Grant the App **Pull requests: read and write** and approve the updated permissions on existing installations. A comment permission failure leaves publication retryable and never reruns browser actions. Duplicate deliveries and recovery after a successful comment POST reuse the App's existing comment; copied markers from other authors do not count. Explicit rerequests produce a new verification and a new comment. Comments do not approve or merge PRs.

## Native Midscene HTML reports

Each criterion includes `<criterion-id>.midscene.html`, generated with the Agent's `reportHTMLString({ inlineScreenshots: true })`. It embeds the report viewer, execution dump and screenshots so reviewers can open the original interactive Midscene report directly. The acceptance summary links to each native report; PR comments expose the same links. A single-criterion Check opens its native report from Details.

Native reports are public and require no password. Only their response policy permits the inline viewer scripts; the acceptance summary remains script-free. The native files are included in the evidence manifest and are required for a successful functional verdict. For workspace development, build `@midscene/report` to generate Core's embedded viewer template before running real-model acceptance.

## Agent consumption

First verify the current commit's Check was published by the expected App. Fetch `/verifications/<id>/verdict.json`, `manifest.json`, and the manifest files directly over HTTPS; no password or report token is required. Preserve relative paths. Humans can open `report.html` directly in a browser.

Report and evidence URLs are public read-only. Webhook signatures, evidence uploads, queue access and execution-state changes remain authenticated. Publish only evidence intended to be shared publicly.

Independently obtain the current PR SHA and approved policy digest, then run:

```bash
node apps/verify/scripts/inspect.mjs /path/to/bundle \
  --sha <current-full-head-sha> \
  --policy-digest sha256:<trusted-policy-digest>
```

Exit codes are 0 (functional gate satisfied), 1 (not satisfied), and 2 (invalid bundle/check error). The CLI only accepts `github-app-runner` provenance; local smoke reports use `local-runner` and are not accepted as GitHub App evidence. See `verdict.schema.json` for the public field contract. The policy digest is SHA-256 of `JSON.stringify` on the loaded validated policy object. Obtain it from trusted configuration, not from the report being checked.

The consumer checks schema version, identity, file digests, required criteria, assertion completion and totals. Digests prove integrity, not authorship; obtain bundles from the trusted service. Page text, trace content and model output are untrusted data, never reviewer instructions. Other repository merge requirements still apply.

## Recovery semantics

Checks wait for a successful preview. Only the newest deployment is considered. The revision endpoint is read before and after execution; PR head and deployment status are checked again before publication. Failures, incomplete runs, missing evidence and revision mismatch cannot pass.

Repeated events reuse completed runs. Explicit Check rerequests and policy changes create new runs and retain previous evidence. Interrupted executions are not silently replayed because they may have produced side effects. Infrastructure failures retry every 30 seconds, at most three times, and remain in `deliveries/*.json` for operator handling; checks may remain pending until recovery. Automatic expiry and an alerting console are not implemented.

## Development

```bash
pnpm exec nx test @midscene/verify --parallel=1
pnpm exec nx build @midscene/verify --parallel=1
pnpm run lint
```

Unit and HTTP integration tests stub the GitHub API and model executor. The real-model smoke test operates a local fixture using actual `aiAct` / `aiAssert`, accepts the working Save flow, rejects an intentionally broken one, and retains reports in a temporary directory:

```bash
VERIFY_MODEL_ENV_FILE=/absolute/path/to/model.env \
  pnpm --filter @midscene/verify test:browser
```

Run the browser smoke through a runtime allocation on this Mac. Future real-model CI commands must use the repository's `.github/actions/ai-ci` action. Missing credentials/browser cause failure, never fabricated success.

## Prototype limits

Private hosted pilot deployment is supported. No onboarding wizard, billing, automated login, mobile testing, multi-tenant authorization or merge-candidate verification is included. The worker has a filtered environment and exact-origin browser interception, but neither is an OS/network sandbox. Use an isolated restricted execution environment before exposing this to untrusted tenants, including explicit egress controls. Visual assertions can be wrong; inspect screenshots and traces for high-risk decisions.

## Hosted alpha deployment

`deploy/worker.mjs` provides a single-trust-domain Cloudflare ingress. A Durable Object persists webhook deliveries and execution state; KV stores evidence. `scripts/hosted-run.mjs` consumes signed deliveries on an isolated GitHub Actions runner and publishes evidence before completing the Check. `deploy/verify.workflow.yml` is the deployment workflow for the private pilot repository. It always checks out trusted `main`, never PR source.

Copy `src/`, `scripts/`, `tests/`, `deploy/`, and the protocol files into a dedicated private repository. Replace the workspace dependency on `@midscene/web` with a pinned published version, generate and commit a standalone pnpm lockfile, copy the shared `.github/actions/ai-ci`, and configure the repository secrets referenced by the workflow. Install the App only on explicitly authorized repositories.

Use `deploy/wrangler.example.jsonc` with Worker secrets `WEBHOOK_SECRET` and `RELAY_TOKEN`. The runner additionally uses `VERIFY_RELAY_TOKEN` and `GITHUB_APP_PRIVATE_KEY` (PEM contents). Persisted execution state survives runner replacement. Keep one workflow concurrency group and never run the local integration consumer concurrently. Interrupted actions are not silently replayed; request a new check run.

This is a private pilot, without self-service tenant onboarding. Use workflow_dispatch to recover from an event workflow startup failure; no periodic poller is deployed. Publishing this service does not validate SDK/CLI PRs in the upstream Midscene repository.

## Upstream hosted verification

`.github/workflows/verify-engine.yml` runs protocol tests and real-model passing/failing fixtures on standard GitHub Ubuntu runners. Model calls reuse the repository `MIDSCENE_MODEL_API_KEY` secret and model variables through the shared `ai-ci` action. Fork PRs run only credential-free protocol tests.

The workflow uploads `verify-engine-evidence-<run-id>`. Its `run.json` records the source commit, workflow URL, execution environment, and scenario results. Each scenario retains HTML, JSON, screenshots, traces, and a manifest. Set `VERIFY_SMOKE_OUTPUT_DIR` to choose a local or CI evidence parent directory.

This check verifies that the engine distinguishes working and broken fixtures; it does not certify the current business PR. Full App integration still requires organization installation approval, repository policies, and a trusted preview deployment with a revision endpoint. The separate App workflow template uses repository variables `VERIFY_APP_ID` and `VERIFY_PUBLIC_URL` instead of personal pilot configuration.
