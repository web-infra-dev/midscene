import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const loadConfigMock = vi.fn<(text: string) => void>();
let memoryStore: Record<string, string> = {};

vi.mock('@midscene/visualizer', () => ({
  useEnvConfig: {
    getState: () => ({
      loadConfig: loadConfigMock,
    }),
  },
}));

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
  loadConfigMock.mockReset();
  vi.resetModules();
});

afterEach(() => {
  (globalThis as { localStorage?: Storage }).localStorage = undefined;
});

describe('saveModelEnvText', () => {
  it('persists the raw text and mirrors it into the visualizer env store', async () => {
    const { saveModelEnvText } = await import(
      '../src/renderer/components/ShellLayout/model-env-storage'
    );
    const text = 'MIDSCENE_MODEL_NAME=gpt-4o\nOPENAI_API_KEY=sk-example';

    saveModelEnvText(text);

    expect(memoryStore['studio:model-env-text']).toBe(text);
    expect(loadConfigMock).toHaveBeenCalledTimes(1);
    expect(loadConfigMock).toHaveBeenCalledWith(text);
  });
});

describe('hydrateModelEnvStores', () => {
  it('is a no-op when no shell text has been saved', async () => {
    const { hydrateModelEnvStores } = await import(
      '../src/renderer/components/ShellLayout/model-env-storage'
    );

    hydrateModelEnvStores();

    expect(loadConfigMock).not.toHaveBeenCalled();
  });

  it('seeds the visualizer store from pre-existing shell text on boot', async () => {
    memoryStore['studio:model-env-text'] = 'MIDSCENE_MODEL_NAME=claude';
    const { hydrateModelEnvStores } = await import(
      '../src/renderer/components/ShellLayout/model-env-storage'
    );

    hydrateModelEnvStores();

    expect(loadConfigMock).toHaveBeenCalledWith('MIDSCENE_MODEL_NAME=claude');
  });
});
