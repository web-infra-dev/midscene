# Puppeteer

Inside MidScene, there are some shortcuts to retrieve context from a Puppeteer page or browser.
```typescript

import Insight from 'midscene';

// From puppeteer page (recommend)
const insightA = await Insight.fromPuppeteerPage(page);
// From puppeteer Browser (use the latest active page)
const insightB = await Insight.fromPuppeteerBrowser(browser);

// continue your code here
const button = await insightA.find(/* ... */);

// perform a click action by coordinates
await page.mouse.click(...button.center);
```

