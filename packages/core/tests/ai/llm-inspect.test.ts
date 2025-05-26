import { AiLocateElement, AiLocateSection } from '@/ai-model';
import { getContextFromFixture } from 'tests/evaluation';
import { expect, test, vi } from 'vitest';

vi.setConfig({
  testTimeout: 60 * 1000,
});

test(
  'basic inspect',
  async () => {
    const { context } = await getContextFromFixture('todo');

    const startTime = Date.now();
    const { parseResult } = await AiLocateElement({
      context,
      targetElementDescription: 'input 输入框',
    });
    expect(parseResult.elements.length).toBe(1);
  },
  {
    timeout: 1000000,
  },
);

test('locate section', async () => {
  const { context } = await getContextFromFixture('todo');
  const { rect } = await AiLocateSection({
    context,
    sectionDescription: '搜索框',
  });
  expect(rect).toBeDefined();
});
