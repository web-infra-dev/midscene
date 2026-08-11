import { Agent } from '@/agent';
import type { AbstractInterface } from '@/device';
import { reportHTMLContent } from '@/utils';
import {
  MIDSCENE_MODEL_API_KEY,
  MIDSCENE_MODEL_BASE_URL,
  MIDSCENE_MODEL_NAME,
} from '@midscene/shared/env';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/utils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/utils')>();
  return {
    ...actual,
    reportHTMLContent: vi.fn(() => '<html>report</html>'),
  };
});

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

describe('Agent report HTML', () => {
  it('keeps report HTML generation enabled outside the Report Viewer build', () => {
    const agent = new Agent(createMockInterface(), {
      generateReport: false,
      modelConfig,
    });

    expect(agent.reportHTMLString()).toBe('<html>report</html>');
    expect(reportHTMLContent).toHaveBeenCalledOnce();
  });
});
