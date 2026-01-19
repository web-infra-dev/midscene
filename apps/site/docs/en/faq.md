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
- `dump/` - Debug data dumps
- `tmp/` - Temporary files
- `output/` - Other output files

For more configuration options, see [Model configuration](./model-config).

## How do I control the report player's default replay style via a link?

You can override the default values of the **Focus on cursor** and **Show element markers** toggles by adding query parameters to the report URL, which determines whether the report highlights the cursor position and element markers. Use `focusOnCursor` and `showElementMarkers` with values such as `true`, `false`, `1`, or `0`. For example: `...?focusOnCursor=false&showElementMarkers=true`.
 
## Customize the network timeout

When doing interaction or navigation on web page, Midscene automatically waits for the network to be idle. It's a strategy to ensure the stability of the automation. Nothing would happen if the waiting process is timeout. 

The default timeout is configured as follows:

1. If it's a page navigation, the default wait timeout is 5000ms (the `waitForNavigationTimeout`)
2. If it's a click, input, etc., the default wait timeout is 2000ms (the `waitForNetworkIdleTimeout`)

You can also customize or disable the timeout by options:

- Use `waitForNetworkIdleTimeout` and `waitForNavigationTimeout` parameters in [Agent](/api.html#constructors).
- Use `waitForNetworkIdle` parameter in [Yaml](/automate-with-scripts-in-yaml.html#the-web-part) or [PlaywrightAiFixture](/integrate-with-playwright.html#step-2-extend-the-test-instance).

## Get an error 403 when using Ollama model in Chrome extension

`OLLAMA_ORIGINS="*"` is required to allow the Chrome extension to access the Ollama model.
