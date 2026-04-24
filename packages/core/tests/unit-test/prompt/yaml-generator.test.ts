import type { IModelConfig } from '@midscene/shared/env';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { callAI, callAIWithStringResponse } from '../../../src/ai-model';
import {
  type ChromeRecordedEvent,
  generateYamlTest,
  generateYamlTestStream,
} from '../../../src/ai-model/prompt/yaml-generator';

vi.mock('../../../src/ai-model', () => ({
  callAI: vi.fn(),
  callAIWithStringResponse: vi.fn(),
}));

const mockCallAI = vi.mocked(callAI);
const mockCallAIWithStringResponse = vi.mocked(callAIWithStringResponse);

const mockEvents: ChromeRecordedEvent[] = [
  {
    type: 'navigation',
    timestamp: 1000,
    url: 'https://example.com',
    title: 'Example Page',
  },
  {
    type: 'click',
    timestamp: 2000,
    elementDescription: 'Login button',
  },
];

const mockedModelConfig = {
  modelName: 'mock',
  modelDescription: 'mock',
  intent: 'default',
  from: 'modelConfig',
} as const satisfies IModelConfig;

describe('yaml-generator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('adds a language instruction when generating YAML', async () => {
    mockCallAIWithStringResponse.mockResolvedValue({
      content: 'yaml-content',
      usage: undefined,
    });

    await generateYamlTest(
      mockEvents,
      {
        testName: 'Recorded session',
        language: 'Chinese',
      },
      mockedModelConfig,
    );

    const prompt = mockCallAIWithStringResponse.mock.calls[0]?.[0];
    expect(prompt?.[1]?.content).toContain(
      'Write all human-readable YAML content in Chinese.',
    );
  });

  it('uses the same language instruction for streaming YAML generation', async () => {
    const onChunk = vi.fn();
    mockCallAI.mockResolvedValue({
      content: 'yaml-content',
      usage: undefined,
      isStreamed: true,
    });

    await generateYamlTestStream(
      mockEvents,
      {
        stream: true,
        onChunk,
        language: 'English',
      },
      mockedModelConfig,
    );

    const prompt = mockCallAI.mock.calls[0]?.[0];
    expect(prompt?.[1]?.content).toContain(
      'Write all human-readable YAML content in English.',
    );
  });
});
