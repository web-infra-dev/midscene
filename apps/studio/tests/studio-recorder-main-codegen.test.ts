import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@midscene/core/ai-model', () => ({
  callAIWithObjectResponse: vi.fn(async () => ({
    content: {
      title: 'Browsing Midscene.js Documentation',
      description: 'The user visited the Midscene.js introduction page.',
    },
  })),
  generatePlaywrightTest: vi.fn(
    async () => 'import { test } from "@playwright/test";\n',
  ),
  generateRecorderYamlTest: vi.fn(
    async () => 'web:\n  url: "https://example.com"\n',
  ),
}));

import {
  callAIWithObjectResponse,
  generatePlaywrightTest,
  generateRecorderYamlTest,
} from '@midscene/core/ai-model';
import {
  generateRecorderCodeInMain,
  generateRecorderMetadataInMain,
  generateRecorderYamlInMain,
} from '../src/main/recorder/codegen';

describe('Studio recorder codegen in main', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const yamlRequest = {
    input: {
      target: {
        platformId: 'web',
        label: 'Web',
        values: {
          url: 'https://example.com',
          viewportWidth: 1280,
          viewportHeight: 720,
        },
      },
      events: [
        {
          type: 'navigation',
          pageInfo: { width: 1280, height: 720 },
          timestamp: 1,
          hashId: 'event-1',
          url: 'https://example.com',
        },
      ],
      testName: 'recording',
    },
    modelConfig: {
      modelName: 'gpt-4o',
      modelDescription: '',
      intent: 'default',
      slot: 'default',
    },
  } as const;

  it('runs recorder YAML generation in the main process layer', async () => {
    await expect(generateRecorderYamlInMain(yamlRequest)).resolves.toEqual({
      yaml: 'web:\n  url: "https://example.com"\n',
    });
    expect(generateRecorderYamlTest).toHaveBeenCalledWith(
      yamlRequest.input,
      yamlRequest.modelConfig,
    );
  });

  it('runs generic YAML code generation in the main process layer', async () => {
    await expect(
      generateRecorderCodeInMain({
        ...yamlRequest,
        type: 'yaml',
      }),
    ).resolves.toEqual({
      type: 'yaml',
      code: 'web:\n  url: "https://example.com"\n',
    });
    expect(generateRecorderYamlTest).toHaveBeenCalledWith(
      yamlRequest.input,
      yamlRequest.modelConfig,
    );
  });

  it('runs Playwright code generation for Web recordings', async () => {
    await expect(
      generateRecorderCodeInMain({
        ...yamlRequest,
        type: 'playwright',
      }),
    ).resolves.toEqual({
      type: 'playwright',
      code: 'import { test } from "@playwright/test";\n',
    });
    expect(generatePlaywrightTest).toHaveBeenCalledWith(
      yamlRequest.input.events,
      expect.objectContaining({
        testName: 'recording',
        viewportSize: { width: 1280, height: 720 },
      }),
      yamlRequest.modelConfig,
    );
  });

  it('rejects Playwright code generation for non-Web recordings', async () => {
    await expect(
      generateRecorderCodeInMain({
        ...yamlRequest,
        type: 'playwright',
        input: {
          ...yamlRequest.input,
          target: {
            platformId: 'computer',
            label: 'Display',
            values: { displayId: '1' },
          },
        },
      }),
    ).rejects.toThrow(
      'Playwright generation is only available for Web recordings.',
    );
  });

  it('generates recorder title and description metadata', async () => {
    await expect(
      generateRecorderMetadataInMain({
        input: {
          target: yamlRequest.input.target,
          events: yamlRequest.input.events,
          fallbackName: 'web recording',
        },
        modelConfig: yamlRequest.modelConfig,
      }),
    ).resolves.toEqual({
      title: 'Browsing Midscene.js Documentation',
      description: 'The user visited the Midscene.js introduction page.',
    });
    expect(callAIWithObjectResponse).toHaveBeenCalledWith(
      expect.any(Array),
      yamlRequest.modelConfig,
    );
    const prompt = vi.mocked(callAIWithObjectResponse).mock.calls[0][0];
    const userMessage = prompt.find((message) => message.role === 'user');
    const promptText =
      Array.isArray(userMessage?.content) &&
      userMessage.content[0] &&
      'text' in userMessage.content[0]
        ? userMessage.content[0].text
        : '';
    expect(promptText).toContain(
      'The description should use the user as the subject',
    );
    expect(promptText).toContain(
      'Do not start the description with "The session ..."',
    );
  });
});
