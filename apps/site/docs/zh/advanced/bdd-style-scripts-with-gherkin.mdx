# BDD 风格脚本（Gherkin）

> 此特性从 Midscene 1.10 开始支持。
>
> BDD 相关能力仍处于 Beta 阶段，未来 API 可能发生变化。

Gherkin 是一种用纯文本描述行为示例的语法，常用于 BDD（Behavior-Driven Development，行为驱动开发）流程。一个 BDD 场景通常包含三类步骤：`Given` 描述前置条件，`When` 描述用户操作，`Then` 描述预期结果。

举例来说，当需要测试待办事项页面的新增功能时，可以把用例写成下面的 Gherkin 脚本。

```gherkin
Scenario: 添加待办事项
  Given 待办事项页面已经打开
  When 添加一条名为“买牛奶”的待办事项
  Then 待办事项列表中应该包含“买牛奶”
```

较长的 GUI 用例也可以写在同一个 `Scenario` 中。你可以按业务阶段组织步骤，每个阶段都使用一组 `Given`、`When`、`Then`。

```gherkin
Scenario: 使用保存的地址下单
  Given 购物车中已有“Midscene Mug”
  When 我打开购物车页面
  Then 购物车中应该显示“Midscene Mug”
  And 小计金额应该可见

  Given 结算页面已经打开
  When 我选择已保存的收货地址
  Then 收货地址区域应该显示所选地址

  Given 支付区域已经可见
  When 我选择已保存的信用卡并提交订单
  Then 页面应该显示订单确认结果
  And 确认页面应该显示订单号
```

这种写法适合一个业务 scenario 自然包含多个 UI 阶段的情况，例如购物车确认、配送地址选择、支付和最终确认。

在 AI 通过自然语言驱动 GUI 操作的场景中，Gherkin 很适合描述操作用例。它让脚本保留自然语言的可读性，同时提供稳定的步骤结构。这种结构也有助于模型生成更规范的用例。

Gherkin 的完整语法可以参考官方的 [Cucumber Gherkin reference](https://cucumber.io/docs/gherkin/reference)。

## 支持规则

Midscene 只支持 Gherkin 的一个子集。这个子集围绕单个场景（Scenario）设计，适合描述一段完整的 GUI 操作流程。

### 步骤映射

- `Given`：调用 `aiAct`，用于准备前置状态。
- `When`：调用 `aiAct`，用于执行用户操作。
- `Then`：调用 `aiAssert`，用于验证页面结果。
- `And`、`But`：沿用前一个主关键字。例如，`Then` 后面的 `And` 也会调用 `aiAssert`。

关键字匹配不区分大小写。因此，`AND`、`and` 和 `And` 都可以识别。

### 场景限制

每次只支持一个 `Scenario:`。如果输入里包含多个 `Scenario:`，Midscene 会报错。

你也可以省略 `Scenario:`，直接写步骤。

```gherkin
Given 待办事项页面已经打开
When 我添加一条名为“买牛奶”的待办事项
Then 待办事项列表中应该包含“买牛奶”
```

### 注意事项

Midscene 会把每个 Gherkin 步骤拆成一次独立的 `aiAct` 或 `aiAssert` 调用。每一步都应该写完整，明确说明操作对象、动作和预期结果。

不要在后续步骤中依赖上一条步骤里的省略信息或模糊指代。比如，不要只写“点击它”或“检查结果”，而应该写清楚要点击的对象和要检查的结果。

下面的写法无法正确执行。原因是步骤之间的上下文相互隔离，后续步骤无法知道“它”和“结果”分别指什么。

```gherkin
Given 待办事项页面已经打开
When 我添加一条名为“买牛奶”的待办事项
And 点击它
Then 检查结果
```

应该写成下面这样。

```gherkin
Given 待办事项页面已经打开
When 我添加一条名为“买牛奶”的待办事项
And 我点击“买牛奶”这条待办事项
Then “买牛奶”这条待办事项应该显示为已完成
```

### 暂不支持

下面这些 Gherkin 特性暂不支持：

- `Feature`
- `Background`
- `Scenario Outline` 或 `Scenario Template`
- `Examples`
- `Rule`
- data tables
- doc strings
- 变量替换、占位符展开或模板语法
- 在同一段输入中包含多个 `Scenario:`

Midscene 不会把 Gherkin 扩展成一种脚本语言。它只读取 `Scenario` 和步骤关键字，再把每个步骤交给 Agent 执行。

循环、条件、变量替换和批量生成等逻辑，应该在调用 Midscene 之前完成。如果需要复用模板，可以先在项目中实现一个 Gherkin 生成器。生成器输出最终的纯文本 `Scenario`，再交给 `runGherkinScenario` 执行。

## 在 JavaScript 中使用

在 JavaScript 或 TypeScript 脚本中，可以直接调用 `agent.runGherkinScenario()`。它接收一段 Gherkin 文本，并按顺序执行其中的步骤。

下面的示例使用 Playwright fixture 获取 Agent。

```ts
import { test } from '@midscene/web/playwright';

test('add a todo item', async ({ page, agentForPage }) => {
  await page.goto('http://localhost:3000/todos');

  const agent = await agentForPage(page);
  await agent.runGherkinScenario(`
Scenario: 添加待办事项
  Given 待办事项页面已经打开
  When 我添加一条名为“买牛奶”的待办事项
  Then 待办事项列表中应该包含“买牛奶”
  And 待办事项数量应该为 1
`);
});
```

第二个参数可以传入运行选项。例如，可以为这次执行提供临时上下文。

```ts
await agent.runGherkinScenario(
  `
Scenario: 添加待办事项
  Given 待办事项页面已经打开
  When 我添加一条名为“买牛奶”的待办事项
  Then 待办事项列表中应该包含“买牛奶”
`,
  {
    context: '这是一个待办事项示例应用。请使用页面上的输入框和添加按钮完成操作。',
  },
);
```

## 在 YAML 中使用

在 YAML flow 中使用 `runGherkinScenario` 步骤。它的值应该是一段块字符串，里面放一个 scenario。

```yaml
web:
  url: http://localhost:3000/todos

tasks:
  - name: Add a todo item
    flow:
      - runGherkinScenario: |
          Scenario: 添加待办事项
            Given 待办事项页面已经打开
            When 我添加一条名为“买牛奶”的待办事项
            Then 待办事项列表中应该包含“买牛奶”
            And 待办事项数量应该为 1
```

YAML 执行时，Midscene 会按步骤运行这个 scenario。`Given` 和 `When` 步骤会调用 `aiAct`，`Then` 以及后面这个 `And` 步骤会调用 `aiAssert`。

## 备注

`runGherkinScenario` 会关闭场景内部的缓存。也就是说，`Given` 和 `When` 映射到 `aiAct` 后，不会使用 `aiAct` 的规划缓存。

这样做是为了让每个 Gherkin 步骤都基于当前页面状态重新解释，避免复用旧步骤带来的误判。
