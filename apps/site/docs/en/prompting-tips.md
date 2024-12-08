# Prompting Tips

The natural language parameter passed to Midscene will be part of the prompt sent to the LLM. There are certain techniques in prompt engineering that can help improve the understanding of user interfaces.

## The purpose of optimization is to get a stable response from AI

Since AI has the nature of heuristic, the purpose of prompt tuning should be to obtain stable responses from the AI model across runs. In most cases, to expect a consistent response from LLM by using a good prompt is entirely feasible.

## Use detailed descriptions and samples

Detailed descriptions and examples are always welcome.

For example: 

Bad ❌: "Search 'headphone'"

Good ✅: "Click the search box (it should be along with a region switch, such as 'domestic' or 'international'), type 'headphone', and hit Enter."

Bad ❌: "Assert: food delivery service is in normal state"

Good ✅: "Assert: There is a 'food delivery service' on page, and is in normal state"

## One prompt should only do one thing

Use `.ai` each time to do one task. Although Midscene has an auto-replanning strategy, it's still preferable to keep the prompt concise. Otherwise the LLM output will likely be messy. The token cost between a long prompt and a short prompt is almost the same.

Bad ❌: "Click Login button, then click Sign up button, fill the form with 'test@test.com' in the email field, 'test' in the password field, and click Sign up button"

Good ✅: Split the task into three steps:

"Click Login Button"
"Click Sign up button"
"Fill the form with 'test@test.com' in the email field, 'test' in the password field, and click Sign up button"

## LLMs can NOT tell the exact number like coords or hex-style color, give it some choices

For example:

Good ✅: "string, color of text, one of blue / red / yellow / green / white / black / others"

Bad ❌: "string, hex value of text color"

Bad ❌: "[number, number], the [x, y] coords of the main button"

## Use report file and playground tool to debug

Open the report file, you will see the detailed information about the steps. If you want to rerun a prompt together with UI context from the report file, just launch a Playground server and click "Send to Playground".

To launch the local Playground server:
```
npx --yes @midscene/web
```

## Infer or assert from the interface, not the DOM properties or browser status

All the data sent to the LLM is in the form of screenshots and element coordinates. The DOM and the browser instance are almost invisible to the LLM. Therefore, ensure everything you expect is visible on the screen.

Good ✅: The title is blue

Bad ❌: The title has a `test-id-size` property

Bad ❌: The browser has two active tabs

Bad ❌: The request has finished.

## Cross-check the result using assertion

LLM could behave incorrectly. A better practice is to check its result after running.

For example, you can check the list content of the to-do app after inserting a record.

```typescript
await ai('Enter "Learning AI the day after tomorrow" in the task box, then press Enter to create');

// check the result
const taskList = await aiQuery<string[]>('string[], tasks in the list');
expect(taskList.length).toBe(1);
expect(taskList[0]).toBe('Learning AI the day after tomorrow');
```

## Non-English prompting is acceptable

Since most AI models can understand many languages, feel free to write the prompt in any language you prefer. It usually works even if the prompt is in a language different from the page's language.

Good ✅: "点击顶部左侧导航栏中的“首页”链接"
