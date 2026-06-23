import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const visualizerState = vi.hoisted(() => ({
  config: {} as Record<string, string>,
  loadConfig: vi.fn(),
}));

vi.mock('@midscene/visualizer', () => ({
  useEnvConfig: {
    getState: () => visualizerState,
  },
}));

let memoryStore: Record<string, string> = {};

beforeEach(() => {
  memoryStore = {};
  (globalThis as { localStorage?: Storage }).localStorage = {
    getItem: (key: string) => memoryStore[key] ?? null,
    setItem: (key: string, value: string) => {
      memoryStore[key] = value;
    },
    removeItem: (key: string) => {
      delete memoryStore[key];
    },
    clear: () => {
      memoryStore = {};
    },
    key: () => null,
    length: 0,
  } as Storage;
  visualizerState.config = {};
  visualizerState.loadConfig.mockReset();
  vi.resetModules();
});

afterEach(() => {
  (globalThis as { localStorage?: Storage }).localStorage = undefined;
});

describe('resolveStudioRecorderModelConfig', () => {
  it('uses the model env text saved by Studio settings', async () => {
    memoryStore['studio:model-env-text'] = [
      'MIDSCENE_MODEL_BASE_URL=https://example.com/v1',
      'MIDSCENE_MODEL_API_KEY=sk-test',
      'MIDSCENE_MODEL_NAME=qwen3-vl-plus',
      'MIDSCENE_MODEL_FAMILY=qwen3-vl',
    ].join('\n');

    const { resolveStudioRecorderModelConfig } = await import(
      '../src/renderer/recorder/model-config'
    );

    expect(resolveStudioRecorderModelConfig()).toMatchObject({
      modelName: 'qwen3-vl-plus',
      openaiApiKey: 'sk-test',
      openaiBaseURL: 'https://example.com/v1',
      modelFamily: 'qwen3-vl',
    });
  });

  it('falls back to the visualizer env store used by playground surfaces', async () => {
    visualizerState.config = {
      MIDSCENE_MODEL_BASE_URL: 'https://example.com/v1',
      MIDSCENE_MODEL_API_KEY: 'sk-test',
      MIDSCENE_MODEL_NAME: 'qwen3-vl-plus',
      MIDSCENE_MODEL_FAMILY: 'qwen3-vl',
    };

    const { resolveStudioRecorderModelConfig } = await import(
      '../src/renderer/recorder/model-config'
    );

    expect(resolveStudioRecorderModelConfig()).toMatchObject({
      modelName: 'qwen3-vl-plus',
      openaiApiKey: 'sk-test',
      openaiBaseURL: 'https://example.com/v1',
      modelFamily: 'qwen3-vl',
    });
  });

  it('falls back when the saved Studio env text is incomplete', async () => {
    memoryStore['studio:model-env-text'] =
      'MIDSCENE_MODEL_API_KEY=sk-incomplete';
    visualizerState.config = {
      MIDSCENE_MODEL_BASE_URL: 'https://example.com/v1',
      MIDSCENE_MODEL_API_KEY: 'sk-test',
      MIDSCENE_MODEL_NAME: 'qwen3-vl-plus',
      MIDSCENE_MODEL_FAMILY: 'qwen3-vl',
    };

    const { resolveStudioRecorderModelConfig } = await import(
      '../src/renderer/recorder/model-config'
    );

    expect(resolveStudioRecorderModelConfig()).toMatchObject({
      modelName: 'qwen3-vl-plus',
      openaiApiKey: 'sk-test',
      openaiBaseURL: 'https://example.com/v1',
      modelFamily: 'qwen3-vl',
    });
  });

  it('throws instead of falling back when the saved Studio env text is invalid', async () => {
    memoryStore['studio:model-env-text'] = [
      'MIDSCENE_MODEL_BASE_URL=https://example.com/v1',
      'MIDSCENE_MODEL_API_KEY=sk-invalid',
      'MIDSCENE_MODEL_NAME=qwen3-vl-plus',
      'MIDSCENE_MODEL_FAMILY=1',
    ].join('\n');
    visualizerState.config = {
      MIDSCENE_MODEL_BASE_URL: 'https://example.com/v1',
      MIDSCENE_MODEL_API_KEY: 'sk-test',
      MIDSCENE_MODEL_NAME: 'qwen3-vl-plus',
      MIDSCENE_MODEL_FAMILY: 'qwen3-vl',
    };

    const { resolveStudioRecorderModelConfig } = await import(
      '../src/renderer/recorder/model-config'
    );

    expect(() => resolveStudioRecorderModelConfig()).toThrow(
      'Invalid MIDSCENE_MODEL_FAMILY value: 1',
    );
  });
});
