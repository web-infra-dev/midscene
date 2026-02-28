import { beforeAll, describe, expect, it, vi } from 'vitest';
import { type ComputerAgent, agentFromComputer } from '../../src';
import { openBrowserAndNavigate } from './test-utils';

vi.setConfig({
  testTimeout: 120 * 1000,
});

const isCacheEnabled = process.env.MIDSCENE_CACHE;

describe('computer todo app automation', () => {
  let agent: ComputerAgent;

  beforeAll(async () => {
    agent = await agentFromComputer({
      aiActionContext:
        'If any popup appears, click agree. If login page appears, skip it.',
    });
  });

  it(
    'should automate todo list operations',
    async () => {
      if (isCacheEnabled) {
        vi.setConfig({ testTimeout: 1000 * 1000 });
      }

      await openBrowserAndNavigate(
        agent,
        'https://todomvc.com/examples/react/dist/',
      );

      // Wait for page to load
      await agent.aiAssert('The todo input box is visible');

      // Add tasks
      await agent.aiAct(
        'Click the task input box, type "Learn JS today", then press Enter to create the task',
      );
      await agent.aiAct(
        'Click the task input box, type "Learn Rust tomorrow", then press Enter to create the task',
      );
      await agent.aiAct(
        'Click the task input box, type "Learning AI the day after tomorrow", then press Enter to create the task',
      );

      // Verify tasks were created
      const allTaskList = await agent.aiQuery<string[]>(
        'string[], tasks in the list',
      );
      console.log('allTaskList', allTaskList);
      expect(allTaskList).toContain('Learn JS today');
      expect(allTaskList).toContain('Learn Rust tomorrow');
      expect(allTaskList).toContain('Learning AI the day after tomorrow');

      // Interact with tasks - hover to show delete button, then click it
      await agent.aiAct(
        'Hover over the "Learn Rust tomorrow" task and click the × delete button that appears on the right side of it',
      );
      await agent.aiAct(
        'Click the checkbox next to "Learning AI the day after tomorrow"',
      );
      await agent.aiAct(
        'Click the "Completed" filter button below the task list',
      );

      // Verify remaining tasks
      const taskList = await agent.aiQuery<string[]>(
        'string[], Extract all task names from the list',
      );
      expect(taskList.length).toBe(1);
      expect(taskList[0]).toBe('Learning AI the day after tomorrow');

      // Verify placeholder text
      const placeholder = await agent.aiQuery(
        'string, return the placeholder text in the input box',
      );
      expect(placeholder).toBe('What needs to be done?');
    },
    600 * 1000,
  );
});
