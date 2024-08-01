# API Reference

## config AI vendor

MidScene uses the OpenAI SDK as the default AI service. You can customize the configuration using environment variables.

There are the main configs, in which `OPENAI_API_KEY` is required.

Required:

```bash
# replace by your own
export OPENAI_API_KEY="sk-abcdefghijklmnopqrstuvwxyz"
```

Optional:

```bash
# optional, if you want to use a customized endpoint
export OPENAI_BASE_URL="https://..."

# optional, if you want to specify a model name other than gpt-4o
export MIDSCENE_MODEL_NAME='claude-3-opus-20240229';

# optional, if you want to pass customized JSON data to the `init` process of OpenAI SDK
export MIDSCENE_OPENAI_INIT_CONFIG_JSON='{"baseURL":"....","defaultHeaders":{"key": "value"}}'
```

## Integration

### Puppeteer

To initialize：

```typescript
import { PuppeteerAgent } from '@midscene/web/puppeteer';

const mid = new PuppeteerAgent(puppeteerPageInstance);
```

You can view the integration sample in [quick-start](../getting-started/quick-start).

### Playwright

You can view the integration sample in [quick-start](../getting-started/quick-start).

## API

> In the following documentation, you may see functions called with the `mid.` prefix. If you use destructuring in Playwright, like `async ({ ai, aiQuery }) => { /* ... */}`, you can call the functions without this prefix. It's just a matter of syntax.

### `.aiAction(steps: string)` or `.ai(steps: string)` - Control the page

You can use `.aiAction` to perform a series of actions. It accepts a `steps: string` as a parameter, which describes the actions. In the prompt, you should clearly describe the steps. MidScene will take care of the rest.

`.ai` is the shortcut for `.aiAction`.

These are some good samples:

```typescript
await mid.aiAction('Enter "Learn JS today" in the task box, then press Enter to create');
await mid.aiAction('Move your mouse over the second item in the task list and click the Delete button to the right of the second task');

// use `.ai` shortcut
await mid.ai('Click the "completed" status button below the task list');
```

Steps should always be clearly and thoroughly described. A very brief prompt like 'Tweet "Hello World"' will result in unstable performance and a high likelihood of failure. 

Under the hood, MidScene will plan the detailed steps by sending your page context and a screenshot to the AI. After that, MidScene will execute the steps one by one. If MidScene deems it impossible to execute, an error will be thrown. 

The main capabilities of MidScene are as follows, and your task will be split into these types. You can see them in the visualization tools:

1. **Locator**: Identify the target element using a natural language description
2. **Action**: Tap, scroll, keyboard input, hover
3. **Others**: Sleep

Currently, MidScene can't plan steps that include conditions and loops.

Related Docs:
* [FAQ: Can MidScene smartly plan the actions according to my one-line goal? Like executing "Tweet 'hello world'](../more/faq.html)
* [Tips for Prompting](../more/prompting-tips.html)

### `.aiQuery(dataDemand: any)` - extract any data from page

You can extract customized data from the UI. Provided that the multi-modal AI can perform inference, it can return both data directly written on the page and any data based on "understanding". The return value can be any valid primitive type, like String, Number, JSON, Array, etc. Just describe it in the `dataDemand`.

For example, to parse detailed information from page:

```typescript
const dataA = await mid.aiQuery({
  time: 'date and time, string',
  userInfo: 'user info, {name: string}',
  tableFields: 'field names of table, string[]',
  tableDataRecord: 'data record of table, {id: string, [fieldName]: string}[]',
});
```

You can also describe the expected return value format as a plain string:

```typescript
// dataB will be a string array
const dataB = await mid.aiQuery('string[], task names in the list');

// dataC will be an array with objects
const dataC = await mid.aiQuery('{name: string, age: string}[], Data Record in the table');
```

### `.aiAssert(conditionPrompt: string, errorMsg?: string)` - do an assertion

This method will soon be available in MidScene.

`.aiAssert` works just like the normal `assert` method, except that the condition is a prompt string written in natural language. MidScene will call AI to determine if the `conditionPrompt` is true. If not, a detailed reason will be concatenated to the `errorMsg`.

```typescript
// coming soon
```

## Use LangSmith (Optional)

LangSmith is a platform designed to debug the LLMs. To integrate LangSmith, please follow these steps:

```shell
# set env variables

# Flag to enable debug
export MIDSCENE_LANGSMITH_DEBUG=1 

# LangSmith config
export LANGCHAIN_TRACING_V2=true
export LANGCHAIN_ENDPOINT="https://api.smith.langchain.com"
export LANGCHAIN_API_KEY="your_key_here"
export LANGCHAIN_PROJECT="your_project_name_here"
```

Launch MidScene, you should see logs like this:

```log
DEBUGGING MODE: langsmith wrapper enabled
```
