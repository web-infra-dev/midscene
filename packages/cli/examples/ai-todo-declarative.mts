/// <reference path="../src/ts-runner/global.d.ts" />

// TodoMVC automation test script (export run function style)
// Usage: midscene examples/ai-todo-declarative.mts

import type { AgentProxy } from '../src/ts-runner/agent-proxy';

export async function run(agent: AgentProxy) {
  // Launch browser inside run function
  await agent.launch({
    headed: true,
    url: 'https://todomvc.com/examples/react/dist/',
  });

  console.log('Starting TodoMVC test (export run style)...');

  // Create a task
  await agent.aiAct(
    'Enter "Learn TypeScript" in the task box, then press Enter to create',
  );

  // Query all tasks
  const tasks = await agent.aiQuery<string[]>('string[], tasks in the list');
  console.log('Tasks:', tasks);

  // Verify task created (fuzzy match)
  const found = tasks.some((task) => task.toLowerCase().includes('typescript'));
  if (!found) {
    throw new Error('Task containing "TypeScript" not found');
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
