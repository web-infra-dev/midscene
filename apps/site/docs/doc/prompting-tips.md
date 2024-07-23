# Tips for Prompting

There are certain techniques in prompt engineering that can help improve the understanding of user interfaces. A better prompt will enhance the stability of return values.

### The purpose of optimization is to get a stable response from AI

Since AI has the nature of heuristic, the purpose of prompt tuning should be to obtain stable responses from the AI model across runs.

In most cases, to expect a consistent response from GPT-4 by using a good prompt is entirely feasible.

### Infer from the UI, not the DOM properties

All the data sent to the AI are the screenshots and element coordinates. The DOM is invisible to the AI. So do not expect the AI infer any information from the DOM (such as `test-id-*` properties).
Ensure everything you expect from the AI is visible in the screenshot.

### Detailed description and samples are welcome

Detailed descriptions and examples are always welcome.
For example: 

Good ✅:  "A search box, along with a region switch such as 'domestic', 'international'"

Bad ❌: "Lower Part of page"

### Get a precise segmentation by matching the surrounding sections

To help AI better tell the edge of each section, you may provide the definition of its surrounding sections.

Here is an example:

```typescript
// to get a precise 'todo-list' section, you may define its surrounds like 'input-box' and 'control-layer'
await insight.segment({
  'input-box': {description: 'input box'},
  'todo-list': query('a list with todo-data', {
    numbersLeft: 'number',
  }),
  'control-layer': { description: 'status and control layer of todo' },
});
```

### GPT-4o can NOT tell the hex value, give it some choices

For example:

Good ✅: string, color of text, one of blue / red / yellow / green / white / black / others

Bad ❌: string, hex value of text color

### Use visualization tool to debug

Use the visualization tool to debug and understand how the AI parse the interface. Just upload the log, and view the AI's parse results.

You can find [the tool](/visualization/index.html) on the navigation bar on this site. The latest log is located at `./midscene_run/latest.insight.json` by default

### Debug how the AI is segmenting the page

If you are using the `segment` method, there will be an icon showing the reason for segmentation in the visualization tool. It's part of the *step-by-step* strategy of AI calling. This may help you to debug your query.

![](/step-by-step-r.png)

### non-English prompting is acceptable

⁠Since AI models can understand many languages, feel free to write the prompt in any language you like.

Good ✅: 顶部左侧导航栏，如“首页”“新闻”等页面列表