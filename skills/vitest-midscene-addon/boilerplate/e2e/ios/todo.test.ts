import { describe, expect } from 'vitest';
import { IOSTest } from '../../src/context';

const pageUrl = 'https://todomvc.com/examples/react/dist/';

describe('iOS TodoMVC', () => {
  const it = IOSTest.init(pageUrl, {
    agentOptions: {
      aiActionContext: 'You are an iOS app testing expert.',
    },
  });

  it('should add and complete a todo', async ({ agent }) => {
    await agent.aiAct(
      "type 'Study AI today' in the task box input and press the Enter key",
    );
    await agent.aiAct(
      "type 'Read a book' in the task box input and press the Enter key",
    );

    const items = await agent.aiQuery('string[], the task list items');
    expect(items.length).toBe(2);

    await agent.aiAct(
      'click the check button on the left of the first task',
    );
    await agent.aiAct("click the 'Completed' status button");

    const completed = await agent.aiQuery(
      'string[], the complete task list',
    );
    expect(completed.length).toBe(1);
  });
});
