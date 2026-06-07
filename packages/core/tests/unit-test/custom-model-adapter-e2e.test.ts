import { dirname, join } from 'node:path';
import { Agent } from '@/agent';
import {
  MIDSCENE_MODEL_API_KEY,
  MIDSCENE_MODEL_BASE_URL,
  MIDSCENE_MODEL_FAMILY,
  MIDSCENE_MODEL_NAME,
} from '@midscene/shared/env';
import { afterEach, describe, expect, it } from 'vitest';

const originalCwd = process.cwd();
const customAdapterPath = join(
  __dirname,
  '../fixtures/custom-model-adapter.cjs',
);
const customAdapterDir = dirname(customAdapterPath);

function createMockInterface() {
  return {
    interfaceType: 'puppeteer',
    actionSpace: () => [],
    destroy: () => undefined,
  } as any;
}

function createAgentWithCustomAdapter(adapterRef: string): Agent {
  return new Agent(createMockInterface(), {
    generateReport: false,
    modelConfig: {
      [MIDSCENE_MODEL_NAME]: 'custom-adapter-test-model',
      [MIDSCENE_MODEL_API_KEY]: 'test-key',
      [MIDSCENE_MODEL_BASE_URL]: 'https://example.com/v1',
      [MIDSCENE_MODEL_FAMILY]: adapterRef,
    },
  });
}

describe('custom model adapter e2e', () => {
  afterEach(() => {
    process.chdir(originalCwd);
  });

  it('loads a custom CommonJS adapter through Agent modelConfig', () => {
    const agent = createAgentWithCustomAdapter(`custom:${customAdapterPath}`);
    const modelConfig = (agent as any).modelConfigManager.getModelConfig(
      'default',
    );
    const modelRuntime = (agent as any).resolveModelRuntime('default');

    expect(modelConfig.modelFamily).toBe(`custom:${customAdapterPath}`);
    expect(modelConfig.modelDescription).toBe(
      `custom model adapter (custom:${customAdapterPath})`,
    );
    expect(modelRuntime.config).toBe(modelConfig);
    expect(modelRuntime.adapter.chatCompletion.unsupportedUserConfig).toEqual([
      'reasoningEffort',
    ]);
    expect(modelRuntime.adapter.planning.defaultReplanningCycleLimit).toBe(6);
    expect(modelRuntime.adapter.planning.supportsActionDeepLocate).toBe(false);
    expect(modelRuntime.adapter.locate.supportsSearchArea).toBe(false);
  });

  it('resolves custom adapter relative paths from process.cwd()', () => {
    process.chdir(customAdapterDir);

    const agent = createAgentWithCustomAdapter(
      'custom:./custom-model-adapter.cjs',
    );
    const modelRuntime = (agent as any).resolveModelRuntime('default');

    expect(modelRuntime.adapter.planning.defaultReplanningCycleLimit).toBe(6);
  });
});
