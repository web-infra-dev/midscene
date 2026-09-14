import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { expect } from '@playwright/test';
import { test } from './fixture';

const CACHE_TIME_OUT = process.env.MIDSCENE_CACHE;

test('agent.runGherkinScenario runs one Gherkin scenario', async ({
  agentForPage,
  page,
}) => {
  if (CACHE_TIME_OUT) {
    test.setTimeout(200 * 1000);
  }

  const fixtureDir = path.resolve(__dirname, '__fixtures__/gherkin-scenario');
  await page.goto(pathToFileURL(path.join(fixtureDir, 'index.html')).href);

  const agent = await agentForPage(page);
  await agent.runGherkinScenario(
    `
Scenario: Create one task
  When I enter the exact text "Review Gherkin API" into the input with placeholder "Task name"
  And I click the "Add task" button exactly once
  Then the task list should contain "Review Gherkin API"
  And the status text should say "1 task"
`,
    {
      context:
        'The page is a small todo app. Perform each requested action exactly as written and do not navigate away from the page.',
      cacheable: false,
    },
  );

  await expect(page.locator('#task-list li')).toHaveText([
    'Review Gherkin API',
  ]);
  await expect(page.locator('#status')).toHaveText('1 task');
});
