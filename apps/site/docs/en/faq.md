# FAQ

## What data is sent to AI model?

The screenshot will be sent to the AI model. In some cases, like setting the `domIncluded` option to `true` when calling `aiAsk` or `aiQuery`, the DOM information will also be sent.

⁠If you are worried about data privacy issues, please refer to [Data Privacy](./data-privacy)

## How to improve the running time?

There are several ways to improve the running time:
1. Use instant action interface like `agent.aiTap('Login Button')` instead of `agent.ai('Click Login Button')`.
2. Use a lower resolution if possible, this will reduce the input token cost.
3. Change to a faster model service
4. Use caching to accelerate the debug process. Read more about it in [Caching](./caching).

## The webpage continues to flash when running in headed mode

It's common when the viewport `deviceScaleFactor` does not match your system settings. Setting it to 2 in OSX will solve the issue.

```typescript
await page.setViewport({
  deviceScaleFactor: 2,
});
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

### 4. Analyze the Cause of Positioning Offset

Positioning offset typically occurs in two scenarios:

**Scenario 1: The model cannot understand semantics**
- Symptoms: Positioning results randomly fall on unrelated elements, with significant variation in results each time.
- Cause: The model may not understand the semantics behind icon buttons. For example, `aiTap('profile center')` is a functional description, and the model may not know the specific style of a profile center icon; whereas `aiTap('person avatar icon')` is a visual description, and the model can locate the element based on its visual characteristics.
- Solution: Optimize prompts by combining visual features and position information to describe the element.
  ```typescript
  // ❌ Using only functional description
  await agent.aiTap('profile center');

  // ✅ Using visual description
  await agent.aiTap('person avatar icon');

  // ✅ Combining visual features and position information
  await agent.aiTap('person avatar icon in the top right corner of the page');
  ```

**Scenario 2: The model recognizes accurately but the positioning has deviation**
- Symptoms: Positioning results fall near the target element but with a few pixels offset.
- Solution: Enabling `deepThink` will significantly improve positioning effectiveness.
  ```typescript
  await agent.aiTap('Login button', {
    deepThink: true
  });
  ```

For more information about `deepThink`, please refer to the [API documentation](/api).

## Does the Doubao phone use Midscene under the hood?

No.
