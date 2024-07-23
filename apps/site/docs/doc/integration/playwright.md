# Playwright

[Playwright.js](https://playwright.dev/) is an open-source automation testing framework developed by Microsoft.

Here is how to integrate MidScene.js into Playwright.js :

```typescript
import Insight, { TextElement, query, retrieveElements, retrieveOneElement } from 'midscene';

test.describe('New Todo', () => {
  test('should allow me to add todo items', async ({ page }) => {
    const insight = await Insight.fromPlaywrightPage(page);
    const todoListPage = await insight.segment({
      'input-box': query<InputBoxSection>('an input box to type item and a "toggle-all" button', {
        element: retrieveOneElement('input box'),
        toggleAllBtn: retrieveOneElement('toggle all button, if exists'),
        placeholder: 'placeholder string in the input box, string, if exists',
        inputValue: 'the value in the input box, string, if exists',
      }),
    });

    // continue your code here
    // ...
  });
});
```

<!-- Here is a [practical example](link_placeholder) that demonstrates how to rewrite the todo-mvc test case of playwright using MidScene.js.  -->
