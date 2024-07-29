# API Reference

## config AI vendor

MidScene uses the OpenAI SDK as the default AI service. Currently OpenAI GPT-4o seems to perform best. However, you can customize the caller configuration with environment variables.

There are the main configs, in which `OPENAI_API_KEY` is required.

Required:

```bash
# replace by your own
export OPENAI_API_KEY="sk-abcdefghijklmnopqrstuvwxyz"
```

Optional:

```bash
# optional, if you want to use a customized endpoint
export OPENAI_BASE_URL="..."

# optional, if you want to specify a model name other than gpt-4o
export MIDSCENE_MODEL_NAME='claude-3-opus-20240229';

# optional, if you want to pass customized JSON data to the `init` process of OpenAI SDK
export MIDSCENE_OPENAI_INIT_CONFIG_JSON='{"baseURL":"....","defaultHeaders":{"key": "value"}}'
```

## Use in Puppeteer

```typescript
import { PuppeteerAgent } from '@midscene/web/puppeteer';

const mid = new PuppeteerAgent(puppeteerPageInstance);
```

A complete sample:

```typescript
import puppeteer, { Viewport } from 'puppeteer';
import { PuppeteerAgent } from '@midscene/web/puppeteer';

// init Puppeteer page
const browser = await puppeteer.launch({
  headless: false, // here we use headed mode to help debug
});

const page = await browser.newPage();
await page.goto('https://www.bing.com');
await page.waitForNavigation({
  timeout: 20 * 1000,
  waitUntil: 'networkidle0',
});

// init MidScene agent, perform actions
const mid = new PuppeteerAgent(page);
await mid.ai('type "how much is the ferry ticket in Shanghai" in search box, hit Enter');
```

## Use in Playwright

## API

> In the following documentation, you may see functions called with the `mid.` prefix. If you use destructuring in Playwright, like `async ({ ai, aiQuery }) => { /* ... */}`, you can call the functions without this prefix. It's just a matter of syntax.

### `.aiAction(steps: string)` or `.ai(steps: string)` - perform your actions

You can use `.aiAction` to perform a series of actions. It accepts a `steps: string` as a parameter, which describes the actions. In the prompt, you should clearly describe the steps. MidScene will take care of the rest.

`.ai` is the shortcut for `.aiAction`.

These are some good samples:

```typescript
await mid.aiAction('Enter "Learn JS today" in the task box, then press Enter to create');
await mid.aiAction('Move your mouse over the second item in the task list and click the Delete button to the right of the second task');

// use `.ai` shortcut
await mid.ai('Click the "completed" status button below the task list');
```

Steps should always be clearly described. A very brief prompt like 'Tweet "Hello World"' will result in unstable performance and a high likelihood of failure. 

Under the hood, MidScene will plan the detailed steps by sending your page context and a screenshot to the AI. After that, MidScene will execute the steps one by one. If MidScene deems it impossible to execute, an error will be thrown. 

The main capabilities of MidScene are as follows, which can be seen in the visualization tools:
1. **Planning**: Determine the steps to accomplish the task
2. **Find**: Identify the target element using a natural language description
3. **Action**: Tap, scroll, keyboard input, hover
4. **Others**: Sleep

Currently, MidScene can't plan steps that include conditions and loops.

:::tip Why can't MidScene smartly plan the actions according to my one-line goal? 

MidScene aims to be an automation assistance SDK. Its action stability (i.e., perform the same actions on each run) is a key feature. To achieve this, we encourage you to write down detailed instructions to help the AI better understand each step of your task. If you want a 'goal-to-task' AI planning tool, you can build one on top of MidScene.

:::

### `.aiQuery(dataShape: any)` - extract any data from page

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
# install langsmith dependency
npm i langsmith

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
