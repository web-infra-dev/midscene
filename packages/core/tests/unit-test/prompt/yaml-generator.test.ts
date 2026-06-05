import type { IModelConfig } from '@midscene/shared/env';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { callAI, callAIWithStringResponse } from '../../../src/ai-model';
import { getModelRuntime } from '../../../src/ai-model/models';
import {
  type ChromeRecordedEvent,
  generateRecorderYamlTest,
  generateRecorderYamlTestStream,
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
    pageInfo: { width: 1280, height: 720 },
    hashId: 'nav-1',
  },
  {
    type: 'click',
    timestamp: 2000,
    elementDescription: 'Login button',
    pageInfo: { width: 1280, height: 720 },
    hashId: 'click-1',
  },
];

const mockedModelConfig = {
  modelName: 'mock',
  modelDescription: 'mock',
  intent: 'default',
  slot: 'default',
} as const satisfies IModelConfig;
const mockedModelRuntime = getModelRuntime(mockedModelConfig);

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
      mockedModelRuntime,
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
      mockedModelRuntime,
    );

    const prompt = mockCallAI.mock.calls[0]?.[0];
    expect(prompt?.[1]?.content).toContain(
      'Write all human-readable YAML content in English.',
    );
  });

  it('preserves non-web recorder targets when generating YAML', async () => {
    mockCallAIWithStringResponse.mockResolvedValue({
      content: 'computer:\n  displayId: "2"\n',
      usage: undefined,
    });

    await generateRecorderYamlTest(
      {
        target: {
          platformId: 'computer',
          label: 'DELL U2720Q',
          values: { displayId: '2' },
        },
        events: [
          {
            type: 'click',
            source: 'studio-preview',
            actionType: 'Click',
            elementDescription: 'Use documentation link',
            elementRect: { x: 73, y: 1071 },
            pageInfo: { width: 1080, height: 1920 },
            timestamp: 1000,
            hashId: 'computer-click',
          },
        ],
        testName: 'Computer recording',
        language: 'Chinese',
      },
      mockedModelConfig,
    );

    const prompt = mockCallAIWithStringResponse.mock.calls[0]?.[0];
    expect(prompt?.[1]?.content).toContain(
      'Preserve this exact top-level target platform: computer',
    );
    expect(prompt?.[1]?.content).toContain('computer:\n  displayId: "2"');
    expect(prompt?.[1]?.content).toContain('Use documentation link');
  });

  it('marks screenshot-event relationships in recorder YAML prompts', async () => {
    mockCallAIWithStringResponse.mockResolvedValue({
      content: 'web:\n  url: "https://example.com"\n',
      usage: undefined,
    });

    await generateRecorderYamlTest(
      {
        target: {
          platformId: 'web',
          label: 'Web',
          values: { url: 'https://example.com' },
        },
        events: [
          {
            type: 'navigation',
            timestamp: 1000,
            url: 'https://example.com',
            title: 'Example Page',
            screenshotAfter:
              'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJ',
            pageInfo: { width: 1280, height: 720 },
            hashId: 'nav-1',
          },
          {
            type: 'click',
            timestamp: 2000,
            elementDescription: 'Login button',
            screenshotWithBox:
              'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSK',
            pageInfo: { width: 1280, height: 720 },
            hashId: 'click-1',
          },
        ],
        maxScreenshots: 2,
      },
      mockedModelConfig,
    );

    const prompt = mockCallAIWithStringResponse.mock.calls[0]?.[0];
    const promptText = prompt
      ?.map((message) =>
        Array.isArray(message.content)
          ? message.content
              .filter((part) => part.type === 'text')
              .map((part) => part.text)
              .join('\n')
          : message.content,
      )
      .join('\n');

    expect(promptText).toContain('Screenshot assets:');
    expect(promptText).toContain('"eventHashId": "nav-1"');
    expect(promptText).toContain(
      'Screenshot asset for event #1: ./screenshots/event-001-navigation.png',
    );
    expect(promptText).toContain('"screenshotPath"');
  });

  it('preserves platform-aware prompt for streaming recorder YAML generation', async () => {
    const onChunk = vi.fn();
    mockCallAI.mockResolvedValue({
      content: 'android:\n  deviceId: "emulator-5554"\n',
      usage: undefined,
      isStreamed: true,
    });

    await generateRecorderYamlTestStream(
      {
        target: {
          platformId: 'android',
          label: 'emulator-5554',
          values: { deviceId: 'emulator-5554' },
        },
        events: [
          {
            type: 'scroll',
            source: 'studio-preview',
            actionType: 'Scroll',
            value: '0,-285',
            pageInfo: { width: 390, height: 844 },
            timestamp: 1000,
            hashId: 'android-scroll',
          },
        ],
      },
      {
        stream: true,
        onChunk,
      },
      mockedModelConfig,
    );

    const prompt = mockCallAI.mock.calls[0]?.[0];
    expect(prompt?.[1]?.content).toContain(
      'Preserve this exact top-level target platform: android',
    );
    expect(prompt?.[1]?.content).toContain(
      'android:\n  deviceId: "emulator-5554"',
    );
  });
});
