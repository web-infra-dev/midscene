/// <reference path="../src/ts-runner/global.d.ts" />

// TodoMVC automation test script
// Usage: npx midscene examples/ai-todo.mts --headed --url https://todomvc.com/examples/react/dist/

console.log('Starting TodoMVC test...');

// Create tasks
await agent.aiAct(
  'Enter "Learn JS today" in the task box, then press Enter to create',
);
await agent.aiAct(
  'Enter "Learn Rust tomorrow" in the task box, then press Enter to create',
);
await agent.aiAct(
  'Enter "Learning AI the day after tomorrow" in the task box, then press Enter to create',
);

// Query all tasks
const allTaskList = await agent.aiQuery<string[]>(
  'string[], tasks in the list',
);
console.log('All tasks:', allTaskList);

// Verify tasks created successfully (use fuzzy match for AI input variance)
const expectedKeywords = ['JS today', 'Rust tomorrow', 'day after tomorrow'];
for (const keyword of expectedKeywords) {
  const found = allTaskList.some((task: string) =>
    task.toLowerCase().includes(keyword.toLowerCase()),
  );
  if (!found) {
    throw new Error(`Task containing "${keyword}" not found`);
  }
}
console.log('All tasks created successfully');

// Delete the second task
await agent.aiAct('Move your mouse over the second item in the task list');
await agent.aiAct('Click the delete button to the right of the second task');
console.log('Second task deleted');

// Complete the second task (now the original third one)
await agent.aiAct('Click the checkbox next to the second task');
console.log('Second task completed');

// View completed tasks
await agent.aiAct('Click the "Completed" status button below the task list');

// Query completed tasks list
const completedTasks = await agent.aiQuery<string[]>(
  'string[], Extract all task names from the list',
);
console.log('Completed tasks:', completedTasks);

if (completedTasks.length !== 1) {
  throw new Error(`Expected 1 completed task, got ${completedTasks.length}`);
}
if (!completedTasks[0].toLowerCase().includes('day after tomorrow')) {
  throw new Error(
    `Expected task containing "day after tomorrow", got "${completedTasks[0]}"`,
  );
}
console.log('Completed tasks verified');

// Query input placeholder
const placeholder = await agent.aiQuery<string>(
  'string, return the placeholder text in the input box',
);
console.log('Input placeholder:', placeholder);

if (placeholder !== 'What needs to be done?') {
  throw new Error(
    `Expected placeholder "What needs to be done?", got "${placeholder}"`,
  );
}
console.log('Placeholder verified');

console.log('\nAll tests passed!');
