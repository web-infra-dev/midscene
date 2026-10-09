import { describe, expect, it } from '@rstest/core';
import { buildModelConfigCode } from '../theme/components/model-config-code';

const config = {
  baseUrl: { value: 'https://example.com/v1', comment: '模型地址' },
  modelName: 'example-model',
  modelFamily: 'example-family',
};

describe('model configuration examples', () => {
  it.each([
    ['default', 'MIDSCENE_MODEL'],
    ['planning', 'MIDSCENE_PLANNING_MODEL'],
    ['insight', 'MIDSCENE_INSIGHT_MODEL'],
  ] as const)('generates the %s configuration', (purpose, prefix) => {
    expect(buildModelConfigCode(config, purpose, 'openai-chat')).toBe(
      [
        `${prefix}_BASE_URL="https://example.com/v1" # 模型地址`,
        `${prefix}_API_KEY="......"`,
        `${prefix}_NAME="example-model"`,
        `${prefix}_FAMILY="example-family"`,
      ].join('\n'),
    );
  });

  it.each([
    ['default', 'MIDSCENE_MODEL'],
    ['planning', 'MIDSCENE_PLANNING_MODEL'],
    ['insight', 'MIDSCENE_INSIGHT_MODEL'],
  ] as const)(
    'generates the %s Responses protocol variable',
    (purpose, prefix) => {
      const code = buildModelConfigCode(
        { ...config, responses: true },
        purpose,
        'openai-responses',
      );
      expect(code).toBe(
        `${buildModelConfigCode(config, purpose, 'openai-chat')}\n${prefix}_PROTOCOL="openai-responses"`,
      );
    },
  );

  it.each([
    ['default', 'MIDSCENE_MODEL'],
    ['planning', 'MIDSCENE_PLANNING_MODEL'],
    ['insight', 'MIDSCENE_INSIGHT_MODEL'],
  ] as const)('generates the %s SIWC configuration', (purpose, prefix) => {
    const code = buildModelConfigCode(
      {
        ...config,
        apiKey: '<your-access-token>',
        protocol: {
          value: 'openai-responses',
          comment: 'SIWC requires the Responses API',
        },
        streamMode: {
          value: 'stream',
          comment: 'SIWC requires streaming',
        },
      },
      purpose,
      'openai-chat',
    );
    expect(code).toContain(
      `${prefix}_PROTOCOL="openai-responses" # SIWC requires the Responses API`,
    );
    expect(code).toContain(`${prefix}_API_KEY="<your-access-token>"`);
    expect(code).toContain(
      'MIDSCENE_MODEL_STREAM_MODE="stream" # SIWC requires streaming',
    );
  });

  it('applies the endpoint override only to Responses', () => {
    const withOverride = {
      ...config,
      responses: {
        baseUrl: {
          value: 'https://example.com/responses-api',
          comment: '新地址',
        },
      },
    };
    expect(
      buildModelConfigCode(withOverride, 'default', 'openai-responses'),
    ).toContain(
      'MIDSCENE_MODEL_BASE_URL="https://example.com/responses-api" # 新地址',
    );
    expect(buildModelConfigCode(withOverride, 'default', 'openai-chat')).toBe(
      buildModelConfigCode(config, 'default', 'openai-chat'),
    );
  });

  it('escapes shell expansion and quotes in configuration values', () => {
    expect(
      buildModelConfigCode(
        { ...config, modelName: 'model"$name`command`\\path' },
        'default',
        'openai-chat',
      ),
    ).toContain('MIDSCENE_MODEL_NAME="model\\"\\$name\\`command\\`\\\\path"');
  });
});
