# FAQ

## What data is sent to AI model?

The screenshot will be sent to the AI model. In some cases, like setting the `domIncluded` option to `true` when calling `aiAsk` or `aiQuery`, the DOM information will also be sent.

⁠If you are worried about data privacy issues, please refer to [Data Privacy](./data-privacy)

## My model provider requires adding specific headers to requests

You can use `defaultHeaders` in the `MIDSCENE_MODEL_INIT_CONFIG_JSON` environment variable to specify headers to include in the request. For example:

```bash
# Add a header with key "foo" and value "bar" to the request
MIDSCENE_MODEL_INIT_CONFIG_JSON='{"defaultHeaders":{"foo":"bar"}}'
```

You can generate the JSON string with JSON serialization to avoid mistakes when writing it by hand:

```javascript
JSON.stringify({ defaultHeaders: { foo: 'bar' } })
```

## How to improve the running time?

There are several ways to improve the running time:
1. Use instant action interface like `agent.aiTap('Login Button')` instead of `agent.ai('Click Login Button')`.
2. Use a lower resolution if possible, this will reduce the input token cost.
3. Change to a faster model service
4. Use caching to accelerate the debug process. Read more about it in [Caching](./caching).

## The webpage continues to flash when running in headed mode

In the local visualization interface, continuous flashing is usually caused by a mismatch between the viewport's `deviceScaleFactor` and the system/browser's pixel ratio (common on high-resolution or Retina screens).

This flashing does not affect Midscene's screenshots or automation execution, but it does affect the local preview experience. To resolve this, set `deviceScaleFactor` to match your browser's `window.devicePixelRatio`, or use Puppeteer's auto-adaptation feature.

```typescript
// Puppeteer: Set deviceScaleFactor to 0 to automatically use the device pixel ratio
await page.setViewport({
  deviceScaleFactor: 0,
});

// Playwright: Playwright does not support using 0 for auto-adaptation like Puppeteer
const page = await browser.newPage({
  deviceScaleFactor: 2, // Replace the number 2 with your window.devicePixelRatio
})
```

If you are unsure of your browser's pixel ratio, you can press F12 on any page to open the console and type `window.devicePixelRatio` to check; or paste the following into the Chrome address bar and press Enter to see the value in a popup:

```plain
data:text/html,<script>alert(`deviceScaleFactor of your browser: ${devicePixelRatio}`)</script>
```

## How do I configure the midscene_run directory?

Midscene saves runtime artifacts (reports, logs, cache, etc.) in the `midscene_run` directory. By default, this directory is created in the current working directory.

You can customize the directory location using the `MIDSCENE_RUN_DIR` environment variable, which accepts both relative and absolute paths:

```bash
# Using a relative path
export MIDSCENE_RUN_DIR="./my_custom_dir"

# Using an absolute path
export MIDSCENE_RUN_DIR="/tmp/midscene_output"
```

The directory contains the following subdirectories:

- `report/` - Test report files (HTML format)
- `log/` - Debug log files
- `cache/` - Cache files (see [Caching](./caching))

For more configuration options, see [Model configuration](./model-config).

## How do I control the report player's default replay style via a link?

You can override the default values of the **Focus on cursor** and **Show element markers** toggles by adding query parameters to the report URL, which determines whether the report highlights the cursor position and element markers. Use `focusOnCursor` and `showElementMarkers` with values such as `true`, `false`, `1`, or `0`. For example: `...?focusOnCursor=false&showElementMarkers=true`.
 
## Customize the network timeout

When doing interaction or navigation on web page, Midscene automatically waits for the network to be idle. It's a strategy to ensure the stability of the automation. Nothing would happen if the waiting process is timeout. 

The default timeout is configured as follows:

1. If it's a page navigation, the default wait timeout is 5000ms (the `waitForNavigationTimeout`)
2. If it's a click, input, etc., the default wait timeout is 2000ms (the `waitForNetworkIdleTimeout`)

You can also customize or disable the timeout by options:

- Use `waitForNetworkIdleTimeout` and `waitForNavigationTimeout` parameters in [Agent](/api#constructors).
- Use `waitForNetworkIdle` parameter in [Yaml](/automate-with-scripts-in-yaml#the-web-part) or [PlaywrightAiFixture](/integrate-with-playwright#step-2-extend-the-test-instance).

## `waiting for fonts to load` or `page.screenshot: Timeout ... exceeded` when taking screenshots

If you see an error like this in a Playwright-based environment:

```plain
page.screenshot: Timeout 10000ms exceeded.
Call log:
- taking page screenshot
- waiting for fonts to load...
```

This is usually not caused by Midscene itself. Playwright waits for fonts to finish loading before taking a screenshot. In some CI, container, or restricted network environments, font resources may load very slowly or never finish, which can eventually cause the screenshot to time out.

You can work around it by setting this environment variable:

```bash
export PW_TEST_SCREENSHOT_NO_FONTS_READY=1
```

If you want to set it only for a single command, you can also write:

```bash
PW_TEST_SCREENSHOT_NO_FONTS_READY=1 <your-command>
```

For more background, see the Playwright issue: [[BUG] Page.screenshot method hangs indefinitely](https://github.com/microsoft/playwright/issues/28995).

## Get an error 403 when using Ollama model in Chrome extension

`OLLAMA_ORIGINS="*"` is required to allow the Chrome extension to access the Ollama model.

## Inaccurate Element Positioning

If you encounter inaccurate element positioning when using Midscene, follow these steps to troubleshoot and resolve the issue:

### 1. Upgrade to the Latest Version

Make sure you are using the latest version of Midscene, as new versions typically include optimizations and improvements for positioning accuracy.

```bash
# Web automation
npm install @midscene/web@latest
# iOS automation
npm install @midscene/ios@latest
# CLI tool
npm install @midscene/cli@latest
# Or other packages corresponding to your platform
```

### 2. Use Better Vision Models

Midscene's element positioning capability relies on the AI model's visual understanding ability, so be sure to choose models that support visual capabilities.

Generally, newer versions and models with larger parameters perform better than older versions and smaller models. For example, Qwen3-VL performs better than Qwen2.5-VL, and its plus version performs better than the flash version.

For more model selection suggestions, please refer to [Model Strategy](./model-strategy).

### 3. Check Model Family Configuration

Verify that the `MIDSCENE_MODEL_FAMILY` parameter is set correctly in your model configuration. Incorrect `MIDSCENE_MODEL_FAMILY` configuration will affect Midscene's adaptation logic for the model. See [Model Configuration](./model-config) for details.

### 4. Optimize prompts with visual features and position information

If the positioning result randomly lands on unrelated elements and varies significantly between runs, the model usually cannot understand the semantics behind the icon button.

For example, `aiTap('profile center')` is a functional description, and the model may not know the specific appearance of a profile icon. In contrast, `aiTap('person avatar icon')` is a visual description, so the model can locate the element based on its visual characteristics.

Solution: optimize prompts by combining visual features and position information to describe the element.

```typescript
// ❌ Using only a functional description
await agent.aiTap('profile center');

// ✅ Using a visual description
await agent.aiTap('person avatar icon');

// ✅ Combining visual features and position information
await agent.aiTap('person avatar icon in the top right corner of the page');
```

### 5. Enable `deepLocate`

If the positioning result lands near the target element but is still off by a few pixels, the model has probably identified the right target but still has some positioning deviation.

Solution: enabling `deepLocate` can significantly improve positioning accuracy.

```typescript
await agent.aiTap('Login button', {
  deepLocate: true
});
```

For more information about `deepLocate`, please refer to the [API documentation](/api).

### 6. Increase the browser DPR to 2 on web

If you are running Midscene in a web browser, you can try increasing the DPR to `2`. In CI environments, the default DPR is often `1`. Raising it to `2` makes the page clearer, which usually improves positioning for small elements.

Keep in mind that this will consume more tokens.

## Does the Doubao phone use Midscene under the hood?

No.
