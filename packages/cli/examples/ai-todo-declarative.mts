/// <reference path="../src/ts-runner/global.d.ts" />

// TodoMVC automation test script (declarative style)
// Usage: midscene examples/ai-todo-declarative.mts

import type { AgentProxy } from '../src/ts-runner/agent-proxy';

export const launch = {
  headed: true,
  url: 'https://todomvc.com/examples/react/dist/',
};

export async function run(agent: AgentProxy) {
  console.log('Starting TodoMVC test (declarative style)...');

  // Create a task
  await agent.aiAct(
    'Enter "Learn TypeScript" in the task box, then press Enter to create',
  );

  // Query all tasks
  const tasks = await agent.aiQuery<string[]>('string[], tasks in the list');
  console.log('Tasks:', tasks);

  // Verify task created
  if (!tasks.includes('Learn TypeScript')) {
    throw new Error('Task "Learn TypeScript" not found');
  }
  console.log('Task created successfully');

  // Complete the task
  await agent.aiAct('Click the checkbox next to the first task');
  console.log('Task completed');

  // Query completed tasks
  await agent.aiAct('Click the "Completed" status button below the task list');
  const completedTasks = await agent.aiQuery<string[]>(
    'string[], Extract all task names from the list',
  );
  console.log('Completed tasks:', completedTasks);

  if (completedTasks.length !== 1) {
    throw new Error(`Expected 1 completed task, got ${completedTasks.length}`);
  }
  console.log('Completed tasks verified');

  console.log('\nAll tests passed!');
}
