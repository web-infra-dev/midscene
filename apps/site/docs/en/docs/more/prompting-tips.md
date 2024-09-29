# Tips for Prompting

The natural language parameter passed to Midscene will be part of the prompt sent to the LLM. There are certain techniques in prompt engineering that can help improve the understanding of user interfaces.

### The purpose of optimization is to get a stable response from AI

Since AI has the nature of heuristic, the purpose of prompt tuning should be to obtain stable responses from the AI model across runs. In most cases, to expect a consistent response from LLM by using a good prompt is entirely feasible.

### Detailed description and samples are welcome

Detailed descriptions and examples are always welcome.

For example: 

Bad ❌: "Search 'headphone'"

Good ✅: "Find the search box (it should be along with a region switch, such as 'domestic' or 'international'), type 'headphone', and hit Enter."

Bad ❌: "Assert: food delivery service is in normal state"

Good ✅: "Assert: There is a 'food delivery service' on page, and is in normal state"

### LLMs can NOT tell the exact number like coords or hex-style color, give it some choices

For example:

Good ✅: "string, color of text, one of blue / red / yellow / green / white / black / others"

Bad ❌: "string, hex value of text color"

Bad ❌: "[number, number], the [x, y] coords of the main button"

### Use visualization tool to debug

Use the visualization tool to debug and understand each step of Midscene. Just upload the log, and view the AI's parse results. You can find [the tool](/visualization/) on the navigation bar on this site. 

### Infer or assert from the interface, not the DOM properties or browser status

All the data sent to the LLM is in the form of screenshots and element coordinates. The DOM and the browser instance are almost invisible to the LLM. Therefore, ensure everything you expect is visible in the on the screen.

Good ✅: The title is blue

Bad ❌: The title has a `test-id-size` property

Bad ❌: The browser has two active tabs

Bad ❌: The request has finished.

### Cross-check the result using assertion

LLM could behave incorrectly. A better practice is to check its result after running.

For example, you can check the list content of the to-do app after inserting a record.

```typescript
await ai('Enter "Learning AI the day after tomorrow" in the task box, then press Enter to create');

// check the result
const taskList = await aiQuery<string[]>('string[], tasks in the list');
expect(taskList.length).toBe(1);
expect(taskList[0]).toBe('Learning AI the day after tomorrow');
```

### Non-English prompting is acceptable

Since most AI models can understand many languages, feel free to write the prompt in any language you prefer. It usually works even if the prompt is in a language different from the page's language.

Good ✅: "点击顶部左侧导航栏中的“首页”链接"
