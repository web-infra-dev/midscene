# @midscene/rstest

Run Midscene AI browser agents as [Rstest](https://rstest.rsbuild.dev/) tests. Built on [`@rstest/playwright`](https://www.npmjs.com/package/@rstest/playwright) — inheriting its debug mode, trace capture, and Playwright-flavored `expect` — plus an Rstest reporter that surfaces Midscene reports.

```ts
import { expect, test as base } from '@midscene/rstest/playwright';
```

The browser engine is explicit in the import path, mirroring `@midscene/web`'s
`/playwright` and `/puppeteer` entries. Playwright is the only engine supported
today.

- **Integration guide**: <https://midscenejs.com/integrate-with-rstest.html>
