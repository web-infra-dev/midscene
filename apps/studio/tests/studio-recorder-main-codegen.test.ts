import { beforeEach, describe, expect, it, rs } from '@rstest/core';

rs.mock('@midscene/core/ai-model', () => ({
  generateRecorderSessionMetadata: rs.fn(async () => ({
    title: 'Browsing Midscene.js Documentation',
    description: 'The user visited the Midscene.js introduction page.',
  })),
  generatePlaywrightTest: rs.fn(
    async () => 'import { test } from "@playwright/test";\n',
  ),
  convertRecordLogIntoMarkdown: rs.fn(
    async () => '# Replay recording\n\n## Steps\n1. Open page\n',
  ),
  generateRecorderYamlTest: rs.fn(
    async () => 'web:\n  url: "https://example.com"\n',
  ),
}));

rs.mock('@midscene/playground/recorder-ui-describer', () => ({
  describeRecorderUIEvents: rs.fn(async () => []),
}));

import {
  convertRecordLogIntoMarkdown,
  generatePlaywrightTest,
  generateRecorderSessionMetadata,
  generateRecorderYamlTest,
} from '@midscene/core/ai-model';
import {
  generateRecorderCodeInMain,
  generateRecorderMetadataInMain,
} from '../src/main/recorder/codegen';
import type { GenerateRecorderCodeRequest } from '../src/shared/electron-contract';

describe('Studio recorder codegen in main', () => {
  beforeEach(() => {
    rs.clearAllMocks();
  });

  const yamlRequest: Omit<GenerateRecorderCodeRequest, 'type'> = {
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
  };

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

  it('runs Markdown replay generation in the main process layer', async () => {
    await expect(
      generateRecorderCodeInMain({
        ...yamlRequest,
        type: 'markdown',
      }),
    ).resolves.toEqual({
      type: 'markdown',
      code: '# Replay recording\n\n## Steps\n1. Open page\n',
    });
    expect(convertRecordLogIntoMarkdown).toHaveBeenCalledWith(
      yamlRequest.input,
      yamlRequest.modelConfig,
    );
  });

  it('retries Markdown replay generation without screenshots after input length errors', async () => {
    rs.mocked(convertRecordLogIntoMarkdown)
      .mockRejectedValueOnce(
        new Error(
          'failed to call AI model service: Range of input length should be [1, 991808]',
        ),
      )
      .mockResolvedValueOnce('# Replay recording\n\n## Steps\n1. Open page\n');

    await expect(
      generateRecorderCodeInMain({
        ...yamlRequest,
        type: 'markdown',
        input: {
          ...yamlRequest.input,
          maxScreenshots: 20,
        },
      }),
    ).resolves.toEqual({
      type: 'markdown',
      code: '# Replay recording\n\n## Steps\n1. Open page\n',
    });

    expect(convertRecordLogIntoMarkdown).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ maxScreenshots: 20 }),
      yamlRequest.modelConfig,
    );
    expect(convertRecordLogIntoMarkdown).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ maxScreenshots: 0 }),
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
    expect(generateRecorderSessionMetadata).toHaveBeenCalledWith(
      {
        target: yamlRequest.input.target,
        events: yamlRequest.input.events,
        fallbackName: 'web recording',
      },
      yamlRequest.modelConfig,
    );
  });
});
