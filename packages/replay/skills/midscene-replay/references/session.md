# Session

By default, `run` and `trial` start headless Chromium with a `PlaywrightBrowserAgent`, open `meta.startUrl` and verify the normalized URL (`--headed` to watch).

By default, `record web` opens a new Chrome window with an isolated profile. Pass `--browser msedge` or `--browser chromium` to open a new window in another browser.

## Use a dedicated signed-in browser

On macOS, launch a Replay window with `node <CLI> browser msedge` or `node <CLI> browser chrome`. The launcher uses a persistent profile for each browser under `~/Library/Application Support/Midscene Replay/` and prints its local CDP endpoint. To reuse an existing Replay window, pass its previously printed endpoint directly to `--cdp`. A second launch on an occupied port returns `CDP_PORT_IN_USE`. Port `9222` is the default. If another app uses it, choose a free `--port PORT`.

On first use, hand the window to the user to sign in manually. Proceed after the user has opened the expected signed-in page. Keep one tab at the exact starting URL, including its query and fragment. That URL is `--url` for recording and `meta.startUrl` for replay.

```sh
node <CLI> browser msedge
node <CLI> record web --url "$START_URL" --out "$NEW_RECORDING" --cdp http://127.0.0.1:9222
node <CLI> run "$REPLAY" --cdp http://127.0.0.1:9222
node <CLI> trial "$REPLAY" --cdp http://127.0.0.1:9222
```

The fixed endpoint avoids per-connection prompts for the daily browser. After quitting the dedicated browser, start it again with the same `browser` command. It keeps its login state while the site's session remains valid. On other platforms, start a browser with a dedicated user data directory and a local debugging port, then use the same `--cdp` flags.

## Attach to the daily browser

Use this mode when the user wants an already open daily browser. In Edge, open `edge://inspect/#remote-debugging`, enable **Allow remote debugging for this browser instance**, and approve the connection when prompted. In Chrome 144 or later, use `chrome://inspect/#remote-debugging` and pass `--cdp chrome`. Keep one signed-in tab open at the exact starting URL.

Before live replay, tell the user which URL and signed-in tab Replay will use. Ask them to leave that tab alone during execution. For a workflow that writes to an external system, confirm the planned writes with the user before starting.

```sh
node <CLI> record web --url "$START_URL" --out "$NEW_RECORDING" --cdp msedge
node <CLI> run "$REPLAY" --cdp msedge
node <CLI> trial "$REPLAY" --cdp msedge
```

## Replay behavior with CDP

- `record` and `run` attach to that tab as it is. Return the tab to the expected start before `run`. The CLI disconnects when finished and leaves the browser and its tabs open.
- A dedicated window supplies a long-lived login source. `trial --cdp` uses it as a `cdp-state` host, taking one in-memory snapshot of cookies applicable to the start URL and that origin's `localStorage`, then starts each round in a fresh Chromium context using that snapshot. `--headed` shows the separate trial browser. Credentials are not written to evidence or the replay folder by the session setup.
- Use a custom session if authentication requires `sessionStorage`, IndexedDB, credentials on other origins, or device-bound state, or if the workflow needs its own backend data reset. Add a meaningful `ready` or `verifyStart` check for the expected signed-in business state. The built-in URL check verifies navigation.
- Choose either `--cdp` or `--session`. A custom session owns authentication and data isolation, including any additional origin state it needs.

## Custom session

Use the [template](../templates/session.mjs) for special login or redirects, backend test data or state reset. Keep it as an authoring/testing attachment outside the delivered `replay/` folder. `prepare` links its `playwright` and `@midscene/web` imports from existing host dependencies.

- Required: `open({outDir})` returns `{agent, close()}`; `close` must release the browser even if Agent teardown fails. `reset(agent, params)` establishes the initial state without pre-executing the workflow. `verifyStart(agent, params)` returns `true` only for the expected start.
- For an SSO app and a separate API origin, load the test account’s required storage or sign in within each new context. For a mutation tested against a backend, seed or reset isolated test data in `reset`, then verify the expected account and data in `verifyStart`. Keep credentials outside the snapshot.
- Use a Playwright or Puppeteer BrowserAgent when the flow opens popups. `generateReport: false` avoids automatic HTML publication. Trial still saves the native dump with screenshots.
- Optional `getParams()` supplies host parameters, available to steps as `ctx.params`.
- Optional `checks`: named async functions for independent checks the script cannot do itself (backend API, reload, another page). Each returns a boolean or `{state: 'pass'|'fail'|'pending'|'inconclusive'|'not_checked', actual?, reason?}`. Assertion errors become fail, other exceptions error, missing results error; only pass succeeds. Do not duplicate the script's own final assertions.

For a frozen trial, place local modules imported by the session beside its entry or in a subdirectory. Trial snapshots the entry and the local ESM modules it imports. Keep credentials in host configuration.

For `run --from STEP --until STEP --session FILE`, give the diagnostic session a `reset` and `verifyStart` for that step's actual entry state. For example, opening an item can start from a seeded results page, with the item id supplied by `getParams()` if the step reads it from `ctx.params`. Keep this fixture separate from the full-workflow session. State set up by a fixture is evidence for the selected step only. See [diagnostic run options](review.md#run).

### Puppeteer replay host

Supply `--session FILE` with a `PuppeteerBrowserAgent` returned by `open`. Use a compatible Puppeteer and Chrome installation in the host. Open a fresh browser or context per trial round. Let the session own navigation and cleanup. For example, in a repository-based host that has Puppeteer installed:

```js
import { PuppeteerBrowserAgent } from '@midscene/web/puppeteer';
import { launchPuppeteerPage } from '@midscene/web/puppeteer-agent-launcher';

export const platform = 'web';

export async function open() {
  const { page } = await launchPuppeteerPage({
    url: 'about:blank',
    waitForNetworkIdle: { timeout: 0 },
  });
  const browser = page.browser();
  try {
    const agent = await PuppeteerBrowserAgent.create(browser, {
      initialPage: page,
      generateReport: false,
    });
    return {
      agent,
      async close() {
        try {
          await agent.destroy();
        } finally {
          await browser.close();
        }
      },
    };
  } catch (error) {
    await browser.close();
    throw error;
  }
}
```

Implement `reset` and `verifyStart` for the actual starting page. Popup following waits for a fresh page from the active source. Native screenshots and evidence are available in a trial. Screenshot-attempt metrics currently instrument Playwright only. Use Playwright for `record web` and the built-in CDP session modes.
