import { sleep } from '@midscene/core/utils';
import { expect } from 'vitest';
import { beforeAll, describe, it, vi } from 'vitest';
import {
  type ComputerAgent,
  ComputerDevice,
  agentFromDesktop,
} from '../../src';

vi.setConfig({
  testTimeout: 120 * 1000,
});

const CACHE_TIME_OUT = process.env.MIDSCENE_CACHE;

describe('computer todo app automation', () => {
  let agent: ComputerAgent;
  const isMac = process.platform === 'darwin';

  beforeAll(async () => {
    agent = await agentFromDesktop({
      aiActionContext:
        'You are testing a web application on a desktop browser.',
    });
  });

  it(
    'should automate todo list operations',
    async () => {
      if (CACHE_TIME_OUT) {
        vi.setConfig({ testTimeout: 1000 * 1000 });
      }

      // Open browser and navigate to todo app
      if (isMac) {
        await agent.aiAct('press Cmd+Space');
        await sleep(500);
        await agent.aiAct('type "Safari" and press Enter');
        await sleep(2000);
        await agent.aiAct('press Cmd+L to focus address bar');
        await sleep(300);
      } else {
        await agent.aiAct('press Windows key');
        await sleep(500);
        await agent.aiAct('type "Chrome" and press Enter');
        await sleep(2000);
        await agent.aiAct('press Ctrl+L to focus address bar');
        await sleep(300);
      }

      await agent.aiAct('type "https://todomvc.com/examples/react/dist/"');
      await agent.aiAct('press Enter');
      await sleep(3000);

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
