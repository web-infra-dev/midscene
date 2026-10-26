# Browser tabs in the CLI

Use the same connection mode for every command in a session:

```sh
midscene-web tabs
midscene-web switch-tab --id <child-tab-id>
midscene-web take_screenshot
midscene-web switch-tab --id <parent-tab-id>
```

`tabs` returns a JSON array containing `id`, `title`, `url`, and `active` (the page controlled by Midscene). Save the parent ID before clicking a link that opens a new tab, then run `tabs` to discover the child. If the site opens the page asynchronously, run `tabs` again after it appears. IDs identify existing tabs, not URLs; switching does not navigate or reload either page. A missing or closed ID is an error.

The CLI preserves popups instead of closing them and navigating the parent to the popup URL. Puppeteer and CDP modes use the existing browser-scoped Agent with automatic popup following disabled. `switch-tab` saves the selected target for later CLI calls. Natural-language `act` can also use the BrowserAgent page actions; its final active page is saved when the command exits.

For CDP, pass `--cdp <endpoint>` on each command (or use `--cdp` with `MIDSCENE_CDP_ENDPOINT` set). For Bridge, pass `--bridge` on each command. Bridge lists tabs in the current Chrome window, activates the selected tab, and reconnects to the foreground tab on subsequent CLI calls. Manually changing the foreground tab therefore affects subsequent Bridge calls. This feature requires an updated Midscene extension; rebuild/reload the extension when testing from source.

`disconnect` releases the connection. In Puppeteer mode, `close` closes the entire browser, not just the selected tab.
