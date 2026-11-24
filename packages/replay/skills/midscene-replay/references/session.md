# Browser ownership and login

Native Test configuration owns execution resources. There is no session.mjs or Replay run host.

For Playwright Chromium, use `webFileSetup` from `@midscene/replay/web-setup` as the Test project's `fileSetup`, with `createMidsceneNodes({agentClass: PlaywrightBrowserAgent, getAgent: ({context}) => context.agent})`. See the config template. Native Test calls the registered cleanup on success, failure and cancellation. Put business reset and start-state assertions in `beforeEach` custom Nodes; a fresh browser does not reset a server account.

| mode | Browser context and tab | Use |
| --- | --- | --- |
| `new` (default without cdp) | Fresh Chromium/context/tab | Public sites and isolated demos |
| `cdp-state` (default with cdp) | Copies start-origin cookies/localStorage into fresh context | Signed-in replay with browser isolation |
| `cdp-tab` | Attaches to exact existing tab, keeps its live state | Apps needing sessionStorage, live connections or expensive warm loading |

`cdp-tab` disconnects at cleanup and leaves the borrowed tab/browser open. Return it to the entrance using native hooks or manual preparation. It is shared, not three isolated sessions. Cookie/localStorage copying is not a promise to preserve cross-origin SSO, IndexedDB or sessionStorage; use the existing tab when appropriate.

## Login

Tell the user that a dedicated Chrome window will open and that they should sign in there, return to the start page and reply when ready. The Agent handles commands:

```sh
midscene-replay browser chrome
midscene-replay record web --url "$START_URL" --out "$RECORDING" --cdp http://127.0.0.1:9222
```

`browser msedge` opens Edge instead. The macOS launcher retains a dedicated profile under `~/Library/Application Support/Midscene Replay/`. An occupied port returns `CDP_PORT_IN_USE`; reuse its known endpoint or select a different port. The normal recording default is a new Chrome window; `--browser msedge|chromium` selects alternatives.

If the user explicitly wants their daily Chrome/Edge, enable remote debugging in that browser's inspect page and use recording `--cdp chrome|msedge`, following connection prompts. Configure the same endpoint and `mode: 'cdp-tab'` in Test for execution. Do not read/copy the daily profile directly.

## Custom native hosts

Existing Playwright/Puppeteer fileSetup implementations remain valid: return an Agent through the normal `getAgent`, register cleanup with `onTeardown`, and initialize/assert the needed state with native hooks. `rp.tap({opensPage})` follows only a popup from the source page and requires a BrowserAgent.

`prepare-step` requires a reachable Chromium CDP endpoint. `webFileSetup` returns `context.replaySession.endpoint`; custom Playwright hosts can expose the same field, and Puppeteer can supply `browser.wsEndpoint()`. The tool identifies the actual target ID, including a followed popup. It attaches WebRecorder to that exact page. There is no second runner/browser lifecycle for preparation.
