# API 参考

这些是 Midscene 中各类 Agent 的主要 API。

> 在以下文档中，你可能会看到带有 `mid.` 前缀的函数调用。如果你在 Playwright 中使用了解构赋值（object destructuring），如 `async ({ ai, aiQuery }) => { /* ... */}`，你可以不带这个前缀进行调用。这只是语法的区别。

## `.aiAction(steps: string)` 或 `.ai(steps: string)` - 控制界面

你可以使用 `.aiAction` 来执行一系列操作。它接受一个参数 `steps: string` 用于描述这些操作。在这个参数中，你应该清楚地描述每一个步骤，然后 Midscene 会自动为你分析并执行。

`.ai` 是 `.aiAction` 的简写。

以下是一些正确示例：

```typescript
await mid.aiAction('在任务框中输入 "Learn JS today"，然后按回车键创建任务');
await mid.aiAction('将鼠标移动到任务列表中的第二项，然后点击第二个任务右侧的删除按钮');

// 使用 `.ai` 简写
await mid.ai('点击任务列表下方的 "completed" 状态按钮');
```

务必使用清晰、详细的步骤描述。使用非常简略的指令（如 “发一条微博” ）会导致非常不稳定的执行结果或运行失败。

在底层，Midscene 会将页面上下文和截图发送给 LLM，以详细规划步骤。随后，Midscene 会逐步执行这些步骤。如果 Midscene 认为无法执行，将抛出一个错误。

你的任务会被拆解成下述内置方法，你可以在可视化报告中看到它们：

1. **定位（Locator）**：使用自然语言描述找到目标元素
2. **操作（Action）**：点击、滚动、键盘输入、悬停（hover）
3. **其他**：等待（sleep）

目前，Midscene 无法规划包含条件和循环的步骤。

关联文档:
* [FAQ: Midscene 能否根据一句话指令实现智能操作？比如执行 "发一条微博"'](./faq)
* [编写提示词的技巧](./prompting-tips)

## `.aiQuery(dataShape: any)` - 从页面提取数据

这个方法可以从 UI 提取自定义数据。它不仅能返回页面上直接书写的数据，还能基于“理解”返回数据（前提是多模态 AI 能够推理）。返回值可以是任何合法的基本类型，比如字符串、数字、JSON、数组等。你只需在 `dataDemand` 中描述它，Midscene 就会给你满足格式的返回。

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

## `.aiAssert(assertion: string, errorMsg?: string)` - 进行断言

`.aiAssert` 的功能类似于一般的断言（assert）方法，但可以用自然语言编写条件参数 `assertion`。Midscene 会调用 AI 来判断条件是否为真。若条件不满足，SDK 会抛出一个错误并在 `errorMsg` 后附上 AI 生成的错误原因。

```typescript
await mid.aiAssert('"Sauce Labs Onesie" 的价格是 7.99');
```

:::tip
断言在测试脚本中往往很重要。为了防止 AI 幻觉造成的错误断言（尤其是漏判了错误），你也可以用 `.aiQuery` + 普通 JS 断言的形式来替代 `.aiAssert`。

例如你可以这么替代上一个断言代码：

```typescript
const items = await mid.aiQuery(
  '"{name: string, price: number}[], 返回商品名称和价格列表)',
);
const onesieItem = items.find(item => item.name === 'Sauce Labs Onesie');
expect(onesieItem).toBeTruthy();
expect(onesieItem.price).toBe(7.99);
```
:::

## `.aiWaitFor(assertion: string, {timeoutMs?: number, checkIntervalMs?: number })` - 等待断言执行成功

`.aiWaitFor` 帮助你检查你的断言是否满足，或是是否发生了超时错误。考虑到 AI 服务的成本，检查间隔不会超过 `checkIntervalMs` 毫秒。默认配置将 `timeoutMs` 设为 15 秒，`checkIntervalMs` 设为 3 秒：也就是说，如果所有断言都失败，并且 AI 服务总是立即响应，则最多检查 5 次。

考虑到 AI 服务的时间消耗，`.aiWaitFor` 并不是一个特别高效的方法。使用一个普通的 `sleep` 可能是替代 `waitFor` 的另一种方式。

```typescript
await mid.aiWaitFor("界面上至少有一个耳机的信息");
```


## 调试配置（可选）

### 打印 AI 性能信息

设置 `MIDSCENE_DEBUG_AI_PROFILE` 变量，你可以看到每次调用 AI 的时间和 token 数量。

```shell
export MIDSCENE_DEBUG_AI_PROFILE=1
```

### 使用 LangSmith

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

启动 Midscene 后，你应该会看到类似如下的日志：

```log
DEBUGGING MODE: langsmith wrapper enabled
```

