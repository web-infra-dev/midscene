/**
 * Remote Browser AI Auto Todo Test
 * Converted from playwright/ai-auto-todo.spec.ts
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { launchRemoteBrowser, logVncUrl } from './utils';

// Set longer timeout for AI tests
vi.setConfig({
  testTimeout: 600 * 1000, // 10 minutes
});

const CACHE_TIME_OUT = process.env.MIDSCENE_CACHE;

describe('ai todo describe', () => {
  let resetFn: (() => Promise<void>) | null = null;

  afterEach(async () => {
    if (resetFn) {
      await resetFn();
      resetFn = null;
    }
  });

  it('ai todo', async () => {
    if (CACHE_TIME_OUT) {
      vi.setConfig({ testTimeout: 1000 * 1000 });
    }

    const { agent, page, vncUrl, reset } = await launchRemoteBrowser({
      cacheId: 'remote-browser-ai-auto-todo',
    });
    resetFn = reset;
    logVncUrl(vncUrl);

    // Navigate to TodoMVC
    await page.goto('https://todomvc.com/examples/react/dist/');

    // Create tasks
    await agent.aiAction('Enter "Happy Birthday" in the task box');
    await agent.aiAction(
      'Enter "Learn JS today"in the task box, then press Enter to create',
    );

    await agent.aiAction(
      'Enter "Learn Rust tomorrow" in the task box, then press Enter to create',
    );
    await agent.aiAction(
      'Enter "Learning AI the day after tomorrow" in the task box, then press Enter to create',
    );

    // Query all tasks
    const allTaskList = await agent.aiQuery<string[]>(
      'string[], tasks in the list',
    );
    console.log('allTaskList', allTaskList);

    // Verify all tasks are created
    expect(allTaskList).toContain('Learn JS today');
    expect(allTaskList).toContain('Learn Rust tomorrow');
    expect(allTaskList).toContain('Learning AI the day after tomorrow');

    // Manipulate tasks
    await agent.aiAction(
      'Move your mouse over the second item in the task list',
    );
    await agent.aiAction(
      'Click the delete button to the right of the second task',
    );
    await agent.aiAction('Click the checkbox next to the second task');
    await agent.aiAction(
      'Click the "completed" Status button below the task list',
    );

    // Query filtered tasks
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
  });
});
