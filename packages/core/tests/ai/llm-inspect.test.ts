import { AiLocateElement } from '@/ai-model';
import { getContextFromFixture } from 'tests/evaluation';
import { expect, test } from 'vitest';

test(
  'basic inspect',
  async () => {
    const { context } = await getContextFromFixture('todo');

    const startTime = Date.now();
    const { parseResult } = await AiLocateElement({
      context,
      targetElementDescription: 'input 输入框',
    });
    console.log('parseResult', JSON.stringify(parseResult, null, 2));
    const endTime = Date.now();
    const cost = endTime - startTime;
    expect(parseResult.elements.length).toBe(1);
  },
  {
    timeout: 1000000,
  },
);

test('use quick answer', async () => {
  const { context } = await getContextFromFixture('todo');

  const startTime = Date.now();
  const { parseResult } = await AiLocateElement({
    context,
    targetElementDescription: 'never mind',
    quickAnswer: {
      id: context.content[0].id,
      reason: 'never mind',
      text: 'never mind',
    },
  });
  console.log('parseResult', parseResult);
  const endTime = Date.now();
  const cost = endTime - startTime;
  expect(parseResult.elements.length).toBe(1);
  expect(cost).toBeLessThan(100);
});
