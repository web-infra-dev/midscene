import { beforeAll, describe, expect, it, vi } from 'vitest';
import { type ComputerAgent, agentFromDesktop } from '../../src';
import { openBrowserAndNavigate } from './test-utils';

vi.setConfig({
  testTimeout: 120 * 1000,
});

const isCacheEnabled = process.env.MIDSCENE_CACHE;

describe('computer todo app automation', () => {
  let agent: ComputerAgent;

  beforeAll(async () => {
    agent = await agentFromDesktop({
      aiActionContext:
        'You are testing a web application on a desktop browser.',
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
      await agent.aiAct('Enter "Happy Birthday" in the task box');
      await agent.aiAct(
        'Enter "Learn JS today" in the task box, then press Enter to create',
      );

      await agent.aiAct(
        'Enter "Learn Rust tomorrow" in the task box, then press Enter to create',
      );
      await agent.aiAct(
        'Enter "Learning AI the day after tomorrow" in the task box, then press Enter to create',
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
        'Move your mouse over the second item in the task list',
      );
      await agent.aiAct(
        'Click the delete button to the right of the second task',
      );
      await agent.aiAct('Click the checkbox next to the second task');
      await agent.aiAct(
        'Click the "completed" Status button below the task list',
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
    360 * 1000,
  );
});
