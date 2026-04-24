# FAQ

## Platform-Specific FAQ

The following platform-specific FAQs are maintained in their respective documentation:

- [Web Browser - Playwright](./integrate-with-playwright#faq)
- [Web Browser - Puppeteer](./integrate-with-puppeteer#faq)
- [Web Browser - Chrome Extension](./quick-experience#faq)
- [Web Browser - Bridge Mode](./bridge-mode#faq)
- [Android](./android-getting-started#faq)
- [iOS](./ios-getting-started#faq)
- [HarmonyOS](./harmony-getting-started#faq)
- [PC Desktop](./computer-getting-started#faq)

## What data is sent to AI model?

The screenshot will be sent to the AI model. In some cases, like setting the `domIncluded` option to `true` when calling `aiAsk` or `aiQuery`, the DOM information will also be sent.

⁠If you are worried about data privacy issues, please refer to [Data Privacy](./data-privacy)

## My model provider requires adding specific headers to requests

You can use `defaultHeaders` in the `MIDSCENE_MODEL_INIT_CONFIG_JSON` environment variable to specify headers to include in the request. For example:

```bash
# Add a header with key "foo" and value "bar" to the request
MIDSCENE_MODEL_INIT_CONFIG_JSON='{"defaultHeaders":{"foo":"bar"}}'
```

If your provider documentation calls this field `extra_headers` or `extraHeaders`, Midscene also accepts those aliases and normalizes them to `defaultHeaders`. When multiple aliases are present, the priority is: `defaultHeaders` > `extra_headers` > `extraHeaders`.

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
