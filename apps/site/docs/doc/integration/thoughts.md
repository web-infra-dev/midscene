# Some Findings

Upon creating test cases, we identified several interesting aspects of the development experience.

## Act based on coordinates rather than the instance of the element 

In most cases, you will interact with the page using X-Y coordinates from MidScene, rather than directly with the element instance. It's more similar to the way people manipulate a page.

## A high-level understanding will bring changes to the project

When writing cases with MidScene, a high-level understanding of the UI is commonly necessary. The structure of your script will resemble 'check state - perform action - check state again'. Developers can primarily focus on the high-level state of the page instead of the underlying DOM.

Here is an example.

Before

```typescript
it('my page works properly', async ({ page }) => {
  // check init state
  await page.goto(/* ... */);
  const pageState = await parse(page);
  await expect(page.getByTestId('...')).toHaveText([/* ... */]);
  await expect(page.getByTestId('...')).toMatch(/* ... */);

  // interact
  await page.getByRole('link', { name: '...' }).click();

  // check state again
  await expect(page.getByTestId('...')).toHaveText([/* ... */]);
  await expect(page.getByTestId('...')).toMatch(/* ... */);
});

```

After using MidScene

```typescript
// high-level state of page
const parse = async (page) => {
  const insight =  await Insight.fromPuppeteerBrowser(browser);
  const content = await insight.segment(
    /* sections and data */
  );

  return content;
}

it('my page works properly', async ({ page }) => {
  // check init state
  await page.goto(/* ... */);
  const pageState = await parse(page);
  expect(pageState.someValue).toMatch(/* ... */);
  expect(pageState.someContent).toMatch(/* ... */);

  // interact
  await page.mouse.click(...pageState.content.confirmBtn.center);

  // check state again
  const pageState2 = await parse(page);
  expect(pageState2.someValue).toMatch(/* ... */);
  expect(pageState2.someContent).toMatch(/* ... */);
});
```

We believe these well-tuned queries will become key assets for your automation project. By understanding every part of your website, the queries will play a big role when it comes to the refinement of your website.

## Most scripts will be slower and more costly, and some scripts will be longer.

Since MidScene.js will invoke AI for each query, the running time may increase by 5 to 10 times. This also implies that you will have to pay for these runs. 😂

What's more, some scripts will be longer than before, especially when the case was simple. You will notice this significant change in the editor.

When considering these costs, MidScene is still very competitive in practice. The unique development experience and easy-to-maintain code it brings are the key to it.