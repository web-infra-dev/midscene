# FAQ

## Can Midscene smartly plan the actions according to my one-line goal? Like executing "Tweet 'hello world'"

No. Midscene is an automation assistance SDK with a key feature of action stability — ensuring the same actions are performed in each run. To maintain this stability, we encourage you to provide detailed instructions to help the AI understand each step of your task.

Related Docs: [Prompting Tips](./prompting-tips.html)

## Limitations

There are some limitations with Midscene. We are still working on them.

1. The interaction types are limited to only tap, type, keyboard press, and scroll.
2. LLM is not 100% stable. Even GPT-4o can't return the right answer all the time. Following the [Prompting Tips](./prompting-tips) will help improve stability.
3. Since we use JavaScript to retrieve elements from the page, the elements inside the iframe cannot be accessed.
4. Do not use Midscene to bypass CAPTCHA. Some LLM services are set to decline requests that involve CAPTCHA-solving (e.g., OpenAI), while the DOM of some CAPTCHA pages is not accessible by regular web scraping methods. Therefore, using Midscene to bypass CAPTCHA is not a reliable method.

## Can I use a model other than `gpt-4o`?

Yes. You can [customize model and provider](./model-provider.html) if needed.

## About the token cost

Image resolution and element numbers (i.e., a UI context size created by Midscene) will affect the token bill.

Here are some typical data with gpt-4o-0806 without prompt caching.

|Task | Resolution | Prompt Tokens / Price | Completion Tokens / Price | Total Cost |
|-----|------------|--------------|---------------|-----------------|
|Plan and perform a search on eBay homepage| 1280x800 | 6005 / $0.0150125 |146 / $0.00146| $0.0164725 |
|Query the information about the item in the search results| 1280x800 | 9107 / $0.0227675 | 122 / $0.00122 | $0.0239875 |

> The price data was calculated in Nov 2024.

## What data is sent to LLM ?

Currently, the contents are: 
1. the key information extracted from the DOM, such as text content, class name, tag name, coordinates; 
2. a screenshot of the page.

## The automation process is running more slowly than the traditional one

Since Midscene.js invokes AI for each planning and querying operation, the running time may increase by a factor of 3 to 10 compared to traditional Playwright scripts, for instance from 5 seconds to 20 seconds. This is currently inevitable but may improve with advancements in LLMs.

Despite the increased time and cost, Midscene stands out in practical applications due to its unique development experience and easy-to-maintain codebase. We are confident that incorporating automation scripts powered by Midscene will significantly enhance your project’s efficiency, cover many more situations, and boost overall productivity.

In short, it is worth the time and cost.

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
