# FAQ

## Can Midscene smartly plan the actions according to my one-line goal? Like executing "Tweet 'hello world'"

No. Midscene is an automation assistance SDK with a key feature of action stability — ensuring the same actions are performed in each run. To maintain this stability, we encourage you to provide detailed instructions to help the AI understand each step of your task.

Related Docs: [Prompting Tips](./prompting-tips)

## Limitations

There are some limitations with Midscene. We are still working on them.

1. The interaction types are limited to only tap, drag, type, keyboard press, and scroll.
2. LLM is not 100% stable. Even GPT-4o can't return the right answer all the time. Following the [Prompting Tips](./prompting-tips) will help improve stability.
3. Since we use JavaScript to retrieve elements from the page, the elements inside the cross-origin iframe cannot be accessed.
4. We cannot access the native elements of Chrome, like the right-click context menu or file upload dialog.
5. Do not use Midscene to bypass CAPTCHA. Some LLM services are set to decline requests that involve CAPTCHA-solving (e.g., OpenAI), while the DOM of some CAPTCHA pages is not accessible by regular web scraping methods. Therefore, using Midscene to bypass CAPTCHA is not a reliable method.

## Can I use a model other than `gpt-4o`?

Of course. You can [choose a model](./choose-a-model) according to your needs.

## What data is sent to AI model?

Currently, the contents are: 
1. the key information extracted from the DOM, such as text content, class name, tag name, coordinates; 
2. a screenshot of the page.

If you are concerned about the data privacy, please refer to [Data Privacy](./data-privacy).

## The automation process is running more slowly than the traditional one

When using general-purpose LLM in Midscene.js, the running time may increase by a factor of 3 to 10 compared to traditional Playwright scripts, for instance from 5 seconds to 20 seconds. To make the result more stable, the token and time cost is inevitable.



There are two ways to improve the running time:
1. Use a dedicated model, like UI-TARS. This is the recommended way. Read more about it in [Choose a model](./choose-a-model).
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
