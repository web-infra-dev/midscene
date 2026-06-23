import { AiLocateElement, AiLocateSection } from '@/ai-model';
import { getModelRuntime } from '@/ai-model/models';
import { globalModelConfigManager } from '@midscene/shared/env';
import { expect, test, vi } from 'vitest';
import { getContextFromFixture } from '../evaluation';

vi.setConfig({
  testTimeout: 120 * 1000,
});

const defaultModelConfig = globalModelConfigManager.getModelConfig('default');
const defaultModelRuntime = getModelRuntime(defaultModelConfig);

test(
  'basic inspect',
  {
    timeout: 1000000,
  },
  async () => {
    const { context } = await getContextFromFixture('todo');

    const { parseResult } = await AiLocateElement({
      context,
      targetElementDescription: 'input 输入框',
      modelRuntime: defaultModelRuntime,
    });
    expect(parseResult.element).toBeDefined();
  },
);

test('locate section', { timeout: 120 * 1000 }, async () => {
  const { context } = await getContextFromFixture('todo');
  const { searchAreaConfig } = await AiLocateSection({
    context,
    sectionDescription: '搜索框',
    modelRuntime: defaultModelRuntime,
  });
  expect(searchAreaConfig?.sourceRect).toBeDefined();
});
