# SDK 接口文档

## 配置 AI 供应商

MidScene 默认集成了 OpenAI SDK 调用 AI 服务，你也可以通过环境变量来自定义配置。

主要配置项如下，其中 `OPENAI_API_KEY` 是必选项：

必选项:

```bash
# 替换为你自己的 API Key
export OPENAI_API_KEY="sk-abcdefghijklmnopqrstuvwxyz"
```

可选项:

```bash
# 可选, 如果你想更换 base URL
export OPENAI_BASE_URL="https://..."

# 可选, 如果你想指定模型名称
export MIDSCENE_MODEL_NAME='claude-3-opus-20240229';

# 可选, 如果你想变更 SDK 的初始化参数
export MIDSCENE_OPENAI_INIT_CONFIG_JSON='{"baseURL":"....","defaultHeaders":{"key": "value"}}'
```

## 在 Puppeteer 中使用

初始化方法：

```typescript
import { PuppeteerAgent } from '@midscene/web/puppeteer';

const mid = new PuppeteerAgent(puppeteerPageInstance);
```

一个完整案例：

```typescript
import puppeteer, { Viewport } from 'puppeteer';
import { PuppeteerAgent } from '@midscene/web/puppeteer';

// 初始化 Puppeteer Page
const browser = await puppeteer.launch({
  headless: false, // here we use headed mode to help debug
});

const page = await browser.newPage();
await page.goto('https://www.bing.com');
await page.waitForNavigation({
  timeout: 20 * 1000,
  waitUntil: 'networkidle0',
});

// 初始化 MidScene agent, 执行操作
const mid = new PuppeteerAgent(page);
await mid.ai('type "Headphones" in search box, hit Enter');
```

## 在 Playwright 中使用

## API

> 在以下文档中，你可能会看到带有 `mid.` 前缀的函数调用。如果你在 Playwright 中使用了解构赋值（object destructuring），如 `async ({ ai, aiQuery }) => { /* ... */}`，你可以不带这个前缀进行调用。这只是语法的区别。

### `.aiAction(steps: string)` 或 `.ai(steps: string)` - 控制界面

你可以使用 `.aiAction` 来执行一系列操作。它接受一个参数 `steps: string` 用于描述这些操作。在这个参数中，你应该清楚地描述每一个步骤，然后 MidScene 会自动为你分析并执行。

`.ai` 是 `.aiAction` 的简写。

以下是一些优质示例：

```typescript
await mid.aiAction('在任务框中输入 "Learn JS today"，然后按回车键创建任务');
await mid.aiAction('将鼠标移动到任务列表中的第二项，然后点击第二个任务右侧的删除按钮');

// 使用 `.ai` 简写
await mid.ai('点击任务列表下方的 "completed" 状态按钮');
```

务必使用清晰、详细的步骤描述。使用非常简略的指令（如 “发一条微博” ）会导致非常不稳定的执行结果或运行失败。

在底层，MidScene 会将页面上下文和截图发送给 LLM，以详细规划步骤。随后，MidScene 会逐步执行这些步骤。如果 MidScene 认为无法执行，将抛出一个错误。

你的任务会被拆解成下述内置方法，你可以在可视化工具中看到它们：

1. **定位（Locator）**：使用自然语言描述找到目标元素
2. **操作（Action）**：点击、滚动、键盘输入、悬停（hover）
3. **其他**：等待（sleep）

目前，MidScene 无法规划包含条件和循环的步骤。

关联文档:
* [FAQ: MidScene 能否根据一句话指令实现智能操作？比如执行 "发一条微博"'](../more/faq.html)
* [编写提示词的技巧](../more/prompting-tips.html)

### `.aiQuery(dataShape: any)` - 从页面提取数据

这个方法可以从 UI 提取自定义数据。它不仅能返回页面上直接书写的数据，还能基于“理解”返回数据（前提是多模态 AI 能够推理）。返回值可以是任何合法的基本类型，比如字符串、数字、JSON、数组等。你只需在 `dataDemand` 中描述它，MidScene 就会给你满足格式的返回。

例如，从页面解析详细信息：

```typescript
const dataA = await mid.aiQuery({
  time: '左上角展示的日期和时间，string',
  userInfo: '用户信息，{name: string}',
  tableFields: '表格的字段名，string[]',
  tableDataRecord: '表格中的数据记录，{id: string, [fieldName]: string}[]',
});

你也可以用纯字符串描述预期的返回值格式：

// dataB 将是一个字符串数组
const dataB = await mid.aiQuery('string[]，列表中的任务名称');

// dataC 将是一个包含对象的数组
const dataC = await mid.aiQuery('{name: string, age: string}[], 表格中的数据记录');
```

### `.aiAssert(conditionPrompt: string, errorMsg?: string)` - 进行断言

这个方法即将上线。

`.aiAssert` 的功能类似于一般的 `assert` 方法，但可以用自然语言编写条件参数 `conditionPrompt`。MidScene 会调用 AI 来判断条件是否为真。若满足条件，详细原因会附加到 `errorMsg` 中。

## 使用 LangSmith （可选）

LangSmith 是一个用于调试大语言模型的平台。想要集成 LangSmith，请按以下步骤操作：


```bash
# 设置环境变量

# 启用调试标志
export MIDSCENE_LANGSMITH_DEBUG=1 

# LangSmith 配置
export LANGCHAIN_TRACING_V2=true
export LANGCHAIN_ENDPOINT="https://api.smith.langchain.com"
export LANGCHAIN_API_KEY="your_key_here"
export LANGCHAIN_PROJECT="your_project_name_here"
```

启动 MidScene 后，你应该会看到类似如下的日志：

```log
DEBUGGING MODE: langsmith wrapper enabled
```

