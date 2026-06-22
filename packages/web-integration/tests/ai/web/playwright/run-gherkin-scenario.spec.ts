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
Feature: Gherkin todo creation

Scenario: Create one task
  Given the Gherkin Todo Lab page is open and ready for input
  When I create a task named "Review Gherkin API"
  Then the task list should contain "Review Gherkin API"
  And the status text should say "1 task"
`,
    {
      context:
        'The page is a small todo app. Use the input with placeholder "Task name" and the "Add task" button to create tasks.',
      cacheable: false,
    },
  );

  await expect(page.locator('#task-list li')).toHaveText([
    'Review Gherkin API',
  ]);
  await expect(page.locator('#status')).toHaveText('1 task');
});
