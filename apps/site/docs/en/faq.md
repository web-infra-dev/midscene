# FAQ

## Can Midscene smartly plan the actions according to my one-line goal? Like executing "Tweet 'hello world'"

No. Midscene is an automation assistance SDK with a key feature of action stability — ensuring the same actions are performed in each run. To maintain this stability, we encourage you to provide detailed instructions to help the AI understand each step of your task.

Related Docs: [Prompting Tips](./prompting-tips)

## Limitations

There are some limitations with Midscene. We are still working on them.

1. The interaction types are limited to only tap, drag (in UI-TARS model only), type, keyboard press, and scroll.
2. AI model is not 100% stable. Following the [Prompting Tips](./prompting-tips) will help improve stability.
3. You cannot interact with the elements inside the cross-origin iframe and canvas when using GPT-4o. This is not a problem when using Qwen and UI-TARS model.
4. We cannot access the native elements of Chrome, like the right-click context menu or file upload dialog.
5. Do not use Midscene to bypass CAPTCHA. Some LLM services are set to decline requests that involve CAPTCHA-solving (e.g., OpenAI), while the DOM of some CAPTCHA pages is not accessible by regular web scraping methods. Therefore, using Midscene to bypass CAPTCHA is not a reliable method.

## Which models are supported?

Please refer to [Choose a model](./choose-a-model).

## What data is sent to AI model?

The screenshot will be sent to the AI model. If you are using GPT-4o, some key information extracted from the DOM will also be sent.

⁠If you are worried about data privacy issues, please refer to [Data Privacy](./data-privacy)

## The automation process is running more slowly than the traditional one

When using general-purpose LLM in Midscene.js, the running time may increase by a factor of 3 to 10 compared to traditional Playwright scripts, for instance from 5 seconds to 20 seconds. To make the result more stable, the token and time cost is inevitable.

There are two ways to improve the running time:
1. Use a dedicated model and deploy it yourself, like UI-TARS. This is the recommended way. Read more about it in [Choose a model](./choose-a-model).
2. Use caching to reduce the token cost. Read more about it in [Caching](./caching).

## The webpage continues to flash when running in headed mode

It's common when the viewport `deviceScaleFactor` does not match your system settings. Setting it to 2 in OSX will solve the issue.

```typescript
await page.setViewport({
  deviceScaleFactor: 2,
});
```

## Where are the report files saved?

The report files are saved in `./midscene-run/report/` by default.

## How Midscene works

It's mainly about the UI parsing and multimodal AI. Here is a flowchart that describes the core process of the interaction between Midscene and AI.

![](/flow.png)
