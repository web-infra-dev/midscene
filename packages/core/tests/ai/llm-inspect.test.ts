import {
  AiLocateElement,
  AiLocateSection,
  callAIWithObjectResponse,
} from '@/ai-model';
import { globalConfigManager, vlLocateMode } from '@midscene/shared/env';
import { getContextFromFixture } from 'tests/evaluation';
import { beforeAll, expect, test, vi } from 'vitest';

vi.setConfig({
  testTimeout: 60 * 1000,
});

beforeAll(async () => {
  await globalConfigManager.init();
});

test(
  'basic inspect',
  {
    timeout: 1000000,
  },
  async () => {
    const { context } = await getContextFromFixture('todo');

    const startTime = Date.now();
    const { parseResult } = await AiLocateElement({
      context,
      targetElementDescription: 'input 输入框',
      callAIFn: callAIWithObjectResponse,
      vlMode: vlLocateMode({ intent: 'default' }),
    });
    expect(parseResult.elements.length).toBe(1);
  },
);

test('locate section', async () => {
  const { context } = await getContextFromFixture('todo');
  const { rect } = await AiLocateSection({
    context,
    sectionDescription: '搜索框',
    vlMode: vlLocateMode({ intent: 'default' }),
  });
  expect(rect).toBeDefined();
});
