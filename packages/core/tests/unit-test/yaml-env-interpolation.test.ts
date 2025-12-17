import { parseYamlScript } from '../../src/yaml/utils';
import { afterEach, describe, expect, it } from 'vitest';

const TEST_ENV_KEY = 'MIDSCENE_TEST_ENV_KEY';
const placeholder = `\${${TEST_ENV_KEY}}`;

const yamlScript = `tasks:
  - name: check env
    flow:
      - ai: ${placeholder}
`;

afterEach(() => {
  delete process.env[TEST_ENV_KEY];
});

describe('parseYamlScript env interpolation', () => {
  it('interpolates process.env by default', () => {
    const expectedValue = 'interpolated';
    process.env[TEST_ENV_KEY] = expectedValue;

    const result = parseYamlScript(yamlScript);

    expect(result.tasks[0]?.flow?.[0]).toEqual({ ai: expectedValue });
  });

  it('skips interpolation when interpolateProcessEnv is false', () => {
    process.env[TEST_ENV_KEY] = 'interpolated';

    const result = parseYamlScript(yamlScript, 'yaml', {
      interpolateProcessEnv: false,
    });

    expect(result.tasks[0]?.flow?.[0]).toEqual({ ai: placeholder });
  });
});
