import { buildYaml, parseYamlScript } from '@/yaml';
import { describe, expect, test } from 'vitest';

describe('utils', () => {
  test('build yaml', () => {
    const yaml = buildYaml({ url: 'https://www.example.com' }, []);
    expect(yaml).toMatchSnapshot();
  });

  describe('parseYamlScript', () => {
    test('interpolates environment variables', () => {
      const yamlContent = `
target:
  url: "sample_url"
tasks:
  - sleep: 1000
  - aiTap: "sample_button"
  - aiInput: "sample_input"
    locate: input description
  - aiInput: 
    locate: input description
`;

      const result = parseYamlScript(yamlContent);
      expect(result).toMatchSnapshot();
    });

    test('interpolates environment variables', () => {
      process.env.TEST_URL = 'https://example.com';
      process.env.TEST_PATH = '/test/path';

      const yamlContent = `
target:
  url: "\${TEST_URL}\${TEST_PATH}"
tasks:
  - sleep: 1000
`;

      const result = parseYamlScript(yamlContent);
      expect(result.target?.url).toBe('https://example.com/test/path');
    });

    test('throws error for undefined environment variables', () => {
      const yamlContent = `
target:
  url: "\${UNDEFINED_ENV_VAR}"
tasks:
  - sleep: 1000
`;

      expect(() => parseYamlScript(yamlContent)).toThrow(
        'Environment variable "UNDEFINED_ENV_VAR" is not defined',
      );
    });
  });
});
