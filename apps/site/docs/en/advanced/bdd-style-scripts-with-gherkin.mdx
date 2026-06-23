# BDD-style scripts with Gherkin

> This feature is available starting in Midscene 1.10.
>
> BDD-related capabilities are still in Beta. The API may change in future releases.

Gherkin is a plain-text syntax for describing behavior examples. It is commonly used in BDD (Behavior-Driven Development) workflows. A BDD scenario usually contains three kinds of steps: `Given` describes the precondition, `When` describes the user action, and `Then` describes the expected result.

For example, when you need to test adding a todo item, you can write the case as the following Gherkin script.

```gherkin
Scenario: Add a todo item
  Given the todo page is open
  When I add a todo item named "Buy milk"
  Then the todo list should contain "Buy milk"
```

Longer GUI cases can also be written in one `Scenario`. You can organize the steps by business phase, and each phase can use a group of `Given`, `When`, and `Then`.

```gherkin
Scenario: Place an order with a saved address
  Given the shopping cart contains "Midscene Mug"
  When I open the cart page
  Then the cart should show "Midscene Mug"
  And the subtotal should be visible

  Given the checkout page is open
  When I choose the saved shipping address
  Then the shipping address section should show the selected address

  Given the payment section is visible
  When I choose the saved credit card and submit the order
  Then the order confirmation page should be displayed
  And the confirmation page should show an order number
```

This style is useful when one business scenario naturally contains several UI phases, such as cart review, shipping selection, payment, and final confirmation.

In AI-driven GUI automation, Gherkin is a natural fit for describing operation cases. It keeps the readability of natural language while providing a stable step structure. This structure also helps models generate more consistent cases.

See the official [Cucumber Gherkin reference](https://cucumber.io/docs/gherkin/reference) for the full Gherkin syntax.

## Supported rules

Midscene supports only a subset of Gherkin. This subset is designed around a single `Scenario`, and is suitable for describing a complete GUI operation flow.

### Step mapping

- `Given`: calls `aiAct`, and prepares the precondition.
- `When`: calls `aiAct`, and performs the user action.
- `Then`: calls `aiAssert`, and verifies the page result.
- `And`, `But`: reuse the previous primary keyword. For example, an `And` after `Then` also calls `aiAssert`.

Keyword matching is case-insensitive. Therefore, `AND`, `and`, and `And` are all recognized.

### Scenario limits

Only one `Scenario:` is supported each time. If the input contains multiple `Scenario:` blocks, Midscene throws an error.

You can also omit `Scenario:` and write the steps directly.

```gherkin
Given the todo page is open
When I add a todo item named "Buy milk"
Then the todo list should contain "Buy milk"
```

### Notes

Midscene splits each Gherkin step into an independent `aiAct` or `aiAssert` call. Each step should be complete, and should clearly describe the target, the action, and the expected result.

Do not depend on omitted information or vague references from previous steps. For example, do not write only "click it" or "check the result". Instead, write the target to click and the result to check.

The following example cannot run correctly. The steps are isolated from each other, so later steps do not know what "it" and "the result" refer to.

```gherkin
Given the todo page is open
When I add a todo item named "Buy milk"
And click it
Then check the result
```

Write it this way instead.

```gherkin
Given the todo page is open
When I add a todo item named "Buy milk"
And I click the "Buy milk" todo item
Then the "Buy milk" todo item should be marked as completed
```

### Not supported

The following Gherkin features are not supported:

- `Feature`
- `Background`
- `Scenario Outline` or `Scenario Template`
- `Examples`
- `Rule`
- data tables
- doc strings
- variable replacement, placeholder expansion, or template syntax
- multiple `Scenario:` blocks in the same input

Midscene does not extend Gherkin into a scripting language. It only reads `Scenario` and step keywords, then passes each step to the Agent.

Loops, conditions, variable replacement, and batch generation should happen before calling Midscene. If you need reusable templates, implement a Gherkin generator in your project. The generator should output the final plain-text `Scenario`, then pass it to `runGherkinScenario`.

## Use in JavaScript

In JavaScript or TypeScript scripts, call `agent.runGherkinScenario()` directly. It receives a Gherkin text string and executes the steps in order.

The following example uses the Playwright fixture to get an Agent.

```ts
import { test } from '@midscene/web/playwright';

test('add a todo item', async ({ page, agentForPage }) => {
  await page.goto('http://localhost:3000/todos');

  const agent = await agentForPage(page);
  await agent.runGherkinScenario(`
Scenario: Add a todo item
  Given the todo page is open
  When I add a todo item named "Buy milk"
  Then the todo list should contain "Buy milk"
  And the todo count should be 1
`);
});
```

The second argument accepts runtime options. For example, you can provide temporary context for this run.

```ts
await agent.runGherkinScenario(
  `
Scenario: Add a todo item
  Given the todo page is open
  When I add a todo item named "Buy milk"
  Then the todo list should contain "Buy milk"
`,
  {
    context:
      'This is a todo demo app. Use the input box and the add button on the page.',
  },
);
```

## Use in YAML

Use the `runGherkinScenario` step in a YAML flow. The value should be a block string containing one scenario.

```yaml
web:
  url: http://localhost:3000/todos

tasks:
  - name: Add a todo item
    flow:
      - runGherkinScenario: |
          Scenario: Add a todo item
            Given the todo page is open
            When I add a todo item named "Buy milk"
            Then the todo list should contain "Buy milk"
            And the todo count should be 1
```

During YAML execution, Midscene runs the scenario step by step. `Given` and `When` steps call `aiAct`, while `Then` and the following `And` step call `aiAssert`.

## Remarks

`runGherkinScenario` disables cache inside the scenario. This means that after `Given` and `When` are mapped to `aiAct`, they do not use the `aiAct` planning cache.

This makes each Gherkin step interpreted from the current page state, and avoids incorrect behavior caused by reusing stale steps.
