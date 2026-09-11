# FAQ

## Platform-Specific FAQ

The following platform-specific FAQs are maintained in their respective documentation:

- [Web Browser - Playwright](./integrate-with-playwright#faq)
- [Web Browser - Puppeteer](./integrate-with-puppeteer#faq)
- [Web Browser - Chrome Extension](./quick-start#chrome-extension-faq)
- [Web Browser - Bridge Mode](./bridge-mode#faq)
- [Android](./platforms/android#faq)
- [iOS](./platforms/ios#faq)
- [HarmonyOS](./platforms/harmonyos#faq)
- [PC Desktop](./platforms/desktop#faq)

## Why are uppercase letters or modifier keys lost when controlling desktop clients such as VNC? {#keyboard-input-through-desktop-clients}

When you use `@midscene/computer` to control VNC, TeamViewer, or a virtual machine console, some clients may not recognize every keyboard event. For example, uppercase `K` may become `k`, `!` may become `1`, or `Control+S` may produce only `s`.

If this happens, add a delay between modifier-key events. The following configuration has been verified with a full-screen VNC client on Windows.

```typescript
import { agentForComputer } from '@midscene/computer';

const agent = await agentForComputer({
  inputStrategy: 'sequential',
  keyboardTypeDelay: 120,
  keyboardModifierDelay: 100,
  keyboardLayout: 'en-US',
});
```

`keyboardModifierDelay` is the primary option for fixing lost modifiers. Start with `100`. After keyboard input works correctly, reduce the value gradually if needed.

### Why does adding a delay help?

Uppercase letters, shifted symbols, and keyboard shortcuts all depend on modifier keys.

For example:

- Uppercase `K` requires `Shift`, followed by `K`.
- On an en-US keyboard, `!` requires `Shift`, followed by `1`.
- `Control+S` requires `Control`, followed by `S`.

Midscene converts these operations into modifier-down, primary-key, and key-release events.

Some desktop clients capture these events and forward them to another system or feature. If the events arrive too close together, the client may not retain the modifier state while handling the primary key. The result can be a lowercase letter, a number instead of a symbol, or a shortcut reduced to its primary key.

When you set `keyboardModifierDelay`, Midscene sends these events in phases and waits between each phase. This gives the desktop client time to recognize and forward the modifier state.

Full-screen VNC is one verified example. However, this behavior is not limited to VNC or remote-control software. Any desktop client that captures or forwards keyboard events can be affected by input timing.

### What does each option do?

- `keyboardModifierDelay` controls the wait between phases of a modified-key input. It applies to shortcuts such as `Control+S` and to the implicit `Shift` in uppercase letters.
- `keyboardTypeDelay` controls the wait between consecutive text characters.
- `inputStrategy: 'sequential'` enters text one character at a time, allowing Midscene to send the corresponding key sequence for uppercase letters and shifted symbols.
- `keyboardLayout: 'en-US'` enables shifted-character mapping for the en-US keyboard layout. For example, it uses `Shift+1` to enter `!`.

Uppercase Latin letters do not require `keyboardLayout`. Only layout-dependent shifted characters such as `!`, `@`, and `#` require this option.

:::warning
Set `keyboardLayout: 'en-US'` only when both the local and target environments use the en-US key mapping. Other layouts may place symbols on different keys or require modifiers such as AltGr.
:::

### Which input methods support this option?

`keyboardModifierDelay` applies only to the local libnut keyboard driver.

- Local desktop control on Windows and Linux uses libnut.
- macOS uses this path when you set `keyboardDriver: 'libnut'`.
- The option has no effect on direct RDP input.
- The option has no effect on the default macOS AppleScript keyboard driver.

AppleScript uses a different input method. Whether a desktop client recognizes it still depends on the client's shortcut interception, keyboard mode, and layout conversion.

### How do I send keyboard shortcuts?

Pass the shortcut through the `keyName` option. Join modifiers and the primary key with `+`, without surrounding spaces.

```typescript
// Send Control+S to the element that already has focus.
await agent.aiKeyboardPress(undefined, {
  keyName: 'Control+S',
});

// Locate the terminal first, then send Control+Shift+P.
await agent.aiKeyboardPress('the terminal window', {
  keyName: 'Control+Shift+P',
});
```

Use `Control+S`, not `Control + S`.

When the target already has focus, pass `undefined` as the first argument. This prevents an additional click from changing the current selection or caret position.

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

## How do I use Azure OpenAI Service?

When using Azure OpenAI Service, first choose the model and fill in the regular configuration from [Supported models and setup](./model-common-config). Azure only requires changing the model service URL and API Key to the Azure form:

```bash
MIDSCENE_MODEL_BASE_URL="https://<your-resource>.services.ai.azure.com/openai/v1" # Or https://<your-resource>.openai.azure.com/openai/v1
MIDSCENE_MODEL_API_KEY="<your-azure-api-key>"
```

In other words, other settings such as `MIDSCENE_MODEL_NAME` and `MIDSCENE_MODEL_FAMILY` should still follow the corresponding model section in [Supported models and setup](./model-common-config). Azure is only a model provider with different authentication, not a special model.

This uses the normal OpenAI-compatible path and sends `POST /openai/v1/chat/completions` with `Authorization: Bearer ...`. Do not append `/chat/completions` to `MIDSCENE_MODEL_BASE_URL`. For most `/openai/v1` endpoints you do not need `api-version`.

If your resource still rejects the request with `400 Missing required query parameter: api-version`, the `/openai/v1` surface on that specific resource has not GA'd yet. Inject the query parameter through `defaultQuery`:

```bash
MIDSCENE_MODEL_INIT_CONFIG_JSON='{"defaultQuery":{"api-version":"preview"}}'
```

Use the `api-version` value your resource expects (`preview`, or a dated version like `2025-01-01-preview` shown in the Azure portal). This turns every request into `.../openai/v1/chat/completions?api-version=preview`.

If an Azure-compatible gateway only accepts the `api-key` header, use this fallback:

```bash
MIDSCENE_MODEL_API_KEY="placeholder"
MIDSCENE_MODEL_INIT_CONFIG_JSON='{"defaultHeaders":{"api-key":"<your-azure-api-key>"}}'
```

In this fallback, `MIDSCENE_MODEL_API_KEY="placeholder"` only satisfies the OpenAI SDK constructor check. The real key is sent through `defaultHeaders.api-key`.

These two fallbacks can be combined when a resource needs both `api-version` and the `api-key` header:

```bash
MIDSCENE_MODEL_API_KEY="placeholder"
MIDSCENE_MODEL_INIT_CONFIG_JSON='{"defaultQuery":{"api-version":"preview"},"defaultHeaders":{"api-key":"<your-azure-api-key>"}}'
```

Azure AD / keyless auth (`DefaultAzureCredential`) is not supported. Use an API key.

## Clicks are offset when using Azure OpenAI

With a GPT-5 family model, you may find that the same script clicks the correct spot on the official OpenAI API but a consistently offset spot on Azure OpenAI. The offset scales with resolution: it appears at large screenshots (e.g. `1920x1080`) and disappears at small ones (e.g. `1280x600`).

The cause is image handling on the Azure side. GPT-5 returns absolute coordinates based on the screenshot it actually sees, and Midscene sends the screenshot with `"detail": "original"` so the model sees the full-resolution image (see the [GPT-5 notes](./model-common-config#gpt)). Azure does not honor `"detail": "original"`, so it downscales large images server-side (the short side is capped at 768). The model then answers in the downscaled coordinate space while Midscene maps coordinates against the original resolution, producing a proportional offset. You can confirm `original` is not taking effect by checking token usage: when `original` works, image token consumption is noticeably higher.

There are two ways to work around it:

1. Use the official OpenAI GPT-5, or configure a separate model dedicated to grounding (localization) and keep the Azure GPT-5 only as the planning model.
2. Pre-shrink the screenshot with the `screenshotShrinkFactor` agent option so the image stays under Azure's downscale threshold and no server-side resizing happens. See [`screenshotShrinkFactor`](./reference/#common).

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

For global runtime options, see [Runtime configuration](./reference/#runtime-configuration).

## How do I control the report player's default replay style via a link?

You can override the default values of the **Focus on cursor** and **Show element markers** toggles by adding query parameters to the report URL, which determines whether the report highlights the cursor position and element markers. Use `focusOnCursor` and `showElementMarkers` with values such as `true`, `false`, `1`, or `0`. For example: `...?focusOnCursor=false&showElementMarkers=true`.

## How do I embed the report as a bare player?

When embedding the report in another page (for example, in an `iframe`), add the `player-only=1` query parameter to strip all the surrounding chrome (top bar, sidebar, timeline, and detail side) and keep only the replay player. Two more flags tune the player:

- `play-control=1` — in player-only mode, show the bottom playback control bar (hidden by default). Opt-in; enabled only by `=1`.
- `auto-play` — whether playback starts automatically on load. This is independent of `player-only` and applies to every report player. It is **on by default**; add `auto-play=0` to disable it.

A typical embed looks like `...?player-only=1&play-control=1`. It also composes with the `#task-<id>` hash anchor, so you can deep-link to a specific step and show only its player: `...?player-only=1#task-0-5`. To open any report (embedded or not) without autoplay, use `...?auto-play=0`.
 
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

For current model recommendations, see [Supported models and setup](./model-common-config).

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

For more information about `deepLocate`, please refer to the [API documentation](/reference/#deep-locate-deeplocate).

### 6. Increase the browser DPR to 2 on web

If you are running Midscene in a web browser, you can try increasing the DPR to `2`. In CI environments, the default DPR is often `1`. Raising it to `2` makes the page clearer, which usually improves positioning for small elements.

Keep in mind that this will consume more tokens.

## The model plans the wrong scroll or swipe direction in aiAct {#scroll-and-swipe-directions}

If the model plans the wrong scroll or swipe direction in `aiAct()`, the cause may be ambiguity in the natural-language instruction.

For example, “scroll down” can mean several things:

- **Move the mouse wheel downward**: with common Windows mouse-wheel settings, the page content moves upward.
- **Move a finger downward on the screen**: the page content follows the finger downward.
- **Reveal content below the current viewport**: the required finger or mouse-wheel movement depends on how the device is operated.

The model may therefore plan a direction that differs from your expectation because it interpreted the instruction differently.

A good way to reduce ambiguity is to **state the result you want to achieve** in the instruction. For example:

- “Scroll down the page to the footer.”
- “Scroll the date picker up to increase the date.”
- “Scroll the page to the right to view the content of the tab on the right.”

Even if you and the model interpret a direction word differently, a clear goal helps the model plan the correct movement.

Midscene instructs the model to prioritize the goal of the scroll or swipe when determining the movement direction. For vague instructions such as “scroll down” or “swipe down”, if the context still does not clarify the intent, the following defaults apply:

- **scroll**: interpret the direction as the off-screen content to reveal. For example, scroll down means revealing content below the current viewport.
- **swipe**: interpret the direction as finger movement. For example, swipe down means moving the finger downward.

## Does the Doubao phone use Midscene under the hood?

No.
