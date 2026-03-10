import { describe, expect, it } from 'vitest';
import { AndroidTest } from '../../src/context';

const pageUrl = 'https://todomvc.com/examples/react/dist/';

describe('Android TodoMVC', () => {
  const ctx = AndroidTest.setup(pageUrl, {
    agentOptions: {
      aiActionContext: 'You are an Android app testing expert.',
    },
  });

  it('should add and complete a todo', async () => {
    await ctx.agent.aiAct(
      "type 'Study AI today' in the task box input and press the Enter key",
    );
    await ctx.agent.aiAct(
      "type 'Read a book' in the task box input and press the Enter key",
    );

    const items = await ctx.agent.aiQuery('string[], the task list items');
    expect(items.length).toBe(2);

    await ctx.agent.aiAct(
      'click the check button on the left of the first task',
    );
    await ctx.agent.aiAct("click the 'Completed' status button");

    const completed = await ctx.agent.aiQuery(
      'string[], the complete task list',
    );
    expect(completed.length).toBe(1);
  });
});
