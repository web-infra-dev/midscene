import { Agent } from '@/agent';
import type { AbstractInterface } from '@/device';
import {
  MIDSCENE_MODEL_API_KEY,
  MIDSCENE_MODEL_BASE_URL,
  MIDSCENE_MODEL_NAME,
} from '@midscene/shared/env';
import { describe, expect, it } from 'vitest';

const modelConfig = {
  [MIDSCENE_MODEL_NAME]: 'test-model',
  [MIDSCENE_MODEL_API_KEY]: 'test-key',
  [MIDSCENE_MODEL_BASE_URL]: 'https://api.test.com/v1',
};

function createMockInterface() {
  return {
    interfaceType: 'puppeteer',
    actionSpace: () => [],
  } as unknown as AbstractInterface;
}

describe('Agent reportFileName', () => {
  it('rejects empty reportFileName when provided', () => {
    expect(
      () =>
        new Agent(createMockInterface(), {
          reportFileName: '',
          modelConfig,
        }),
    ).toThrow('reportFileName must be a non-empty string');
  });
});
