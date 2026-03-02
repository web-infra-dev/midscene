import { ConversationHistory, plan } from '@/ai-model';
import { globalModelConfigManager } from '@midscene/shared/env';
import { mockActionSpace } from 'tests/common';
import { getContextFromFixture } from 'tests/evaluation';
import { describe, expect, it, vi } from 'vitest';

vi.setConfig({
  testTimeout: 180 * 1000,
  hookTimeout: 30 * 1000,
});

const modelConfig = globalModelConfigManager.getModelConfig('default');

// Regression test for https://github.com/web-infra-dev/midscene/issues/2049
// When user instruction contains quoted text (e.g. "hello world"),
// some models produce unescaped quotes in JSON values, causing parse failures.
// The prompt examples now use backticks to guide the model away from this.
describe('planning - quoted text in instruction (#2049)', () => {
  it('should not throw parse error when instruction contains double-quoted text', async () => {
    const { context } = await getContextFromFixture('todo');

    const result = await plan(
      '在输入框中输入 "hello world"，然后按回车',
      {
        context,
        actionSpace: mockActionSpace,
        interfaceType: 'puppeteer',
        modelConfig,
        conversationHistory: new ConversationHistory(),
        includeBbox: true,
      },
    );

    // The key assertion: plan() returned successfully without parse error
    expect(result).toBeTruthy();
    expect(result.rawResponse).toBeTruthy();
  });

  it('should not throw parse error with multiple quoted strings', async () => {
    const { context } = await getContextFromFixture('todo');

    const result = await plan(
      '在输入框中输入 "learn JavaScript"，按回车，再输入 "learn Rust"',
      {
        context,
        actionSpace: mockActionSpace,
        interfaceType: 'puppeteer',
        modelConfig,
        conversationHistory: new ConversationHistory(),
        includeBbox: true,
      },
    );

    expect(result).toBeTruthy();
    expect(result.rawResponse).toBeTruthy();
  });
});
