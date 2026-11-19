import { AiLocateElement, AiLocateSection } from '@/ai-model';
import { getModelRuntime } from '@/ai-model/models';
import { globalModelConfigManager } from '@midscene/shared/env';
import { expect, rs, test } from '@rstest/core';
import { getContextFromFixture } from '../evaluation';

rs.setConfig({
  testTimeout: 120 * 1000,
});

const defaultModelRuntime = () =>
  getModelRuntime(globalModelConfigManager.getModelConfig('default'));

test(
  'basic inspect',
  {
    timeout: 1000000,
  },
  async () => {
    const { uiContext } = await getContextFromFixture('todo');

    const { parseResult } = await AiLocateElement({
      uiContext,
      targetElementDescription: 'input 输入框',
      modelRuntime: defaultModelRuntime(),
    });
    expect(parseResult.element).toBeDefined();
  },
);

test('locate section', { timeout: 120 * 1000 }, async () => {
  const { uiContext } = await getContextFromFixture('todo');
  const { searchAreaConfig } = await AiLocateSection({
    uiContext,
    sectionDescription: '搜索框',
    modelRuntime: defaultModelRuntime(),
  });
  expect(searchAreaConfig?.sourceRect).toBeDefined();
});
