import { describe, expect, it } from 'vitest';
import {
  parseEnvEntries,
  parseEnvText,
  resolveModelConnection,
  serializeEnvEntries,
} from '../src/renderer/components/ShellLayout/connectivity-env';

describe('parseEnvText', () => {
  it('parses plain KEY=VALUE lines', () => {
    expect(
      parseEnvText('OPENAI_API_KEY=sk-123\nMIDSCENE_MODEL=gpt-4o'),
    ).toEqual({
      MIDSCENE_MODEL: 'gpt-4o',
      OPENAI_API_KEY: 'sk-123',
    });
  });

  it('skips comments and blank lines, strips quotes', () => {
    expect(
      parseEnvText(
        '# comment\n\nOPENAI_BASE_URL="https://api.example.com/v1"\n  OPENAI_API_KEY =  sk-abc  ',
      ),
    ).toEqual({
      OPENAI_API_KEY: 'sk-abc',
      OPENAI_BASE_URL: 'https://api.example.com/v1',
    });
  });
});

describe('resolveModelConnection', () => {
  it('prefers MIDSCENE_MODEL_* over OPENAI_* when both exist', () => {
    const result = resolveModelConnection({
      MIDSCENE_MODEL_API_KEY: 'mid-key',
      MIDSCENE_MODEL_BASE_URL: 'https://mid.example.com',
      MIDSCENE_MODEL_NAME: 'mid-model',
      OPENAI_API_KEY: 'oai-key',
      OPENAI_BASE_URL: 'https://oai.example.com',
    });
    expect(result).toEqual({
      apiKey: 'mid-key',
      baseUrl: 'https://mid.example.com',
      model: 'mid-model',
    });
  });

  it('falls back to OPENAI_* and MIDSCENE_MODEL for the model', () => {
    const result = resolveModelConnection({
      MIDSCENE_MODEL: 'gpt-4o',
      OPENAI_API_KEY: 'oai-key',
      OPENAI_BASE_URL: 'https://oai.example.com',
    });
    expect(result).toEqual({
      apiKey: 'oai-key',
      baseUrl: 'https://oai.example.com',
      model: 'gpt-4o',
    });
  });

  it('preserves entry order and round-trips', () => {
    const source =
      'MIDSCENE_MODEL_API_KEY="my-key"\nMIDSCENE_MODEL_BASE_URL=\'https://example.com\'\nMIDSCENE_MODEL_FAMILY=qwen3.5';
    const entries = parseEnvEntries(source);
    expect(entries.map((entry) => entry.key)).toEqual([
      'MIDSCENE_MODEL_API_KEY',
      'MIDSCENE_MODEL_BASE_URL',
      'MIDSCENE_MODEL_FAMILY',
    ]);
    expect(entries.map((entry) => entry.value)).toEqual([
      'my-key',
      'https://example.com',
      'qwen3.5',
    ]);

    const round = serializeEnvEntries(entries);
    expect(parseEnvEntries(round)).toEqual(entries);
  });

  it('reports missing required keys', () => {
    const result = resolveModelConnection({ OPENAI_API_KEY: 'sk' });
    expect(result).toEqual({
      error: expect.stringContaining('OPENAI_BASE_URL'),
    });
  });
});
