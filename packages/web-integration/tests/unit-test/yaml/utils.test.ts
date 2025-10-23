import { buildYaml, parseYamlScript } from '@midscene/core/yaml';
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

    test('should not throw error for undefined env vars in commented lines', () => {
      const yamlContent = `
# DEV_USERNAME="\${UNDEFINED_ENV_VAR}"
target:
  url: "https://example.com"
tasks:
  - sleep: 1000
  # - aiInput: "\${ANOTHER_UNDEFINED_VAR}"
  #   locate: "input field"
`;

      expect(() => parseYamlScript(yamlContent)).not.toThrow();
      const result = parseYamlScript(yamlContent);
      expect(result.target?.url).toBe('https://example.com');
    });

    test('should handle mixed commented and uncommented env vars', () => {
      process.env.DEFINED_VAR = 'defined_value';

      const yamlContent = `
# This is a comment with \${UNDEFINED_VAR_IN_COMMENT}
target:
  url: "https://example.com/\${DEFINED_VAR}"
tasks:
  - sleep: 1000
  # - aiAction: "click \${UNDEFINED_IN_COMMENT}"
`;

      const result = parseYamlScript(yamlContent);
      expect(result.target?.url).toBe('https://example.com/defined_value');

      process.env.DEFINED_VAR = undefined;
    });

    test('android number-style deviceId', () => {
      const yamlContent = `
android:
  deviceId: 001234567890
tasks:
- sleep: 1000
`;

      const result = parseYamlScript(yamlContent);
      expect(result.android?.deviceId).toBe('001234567890');
    });

    test('illegal android deviceId', () => {
      const yamlContent = `
android:
  deviceId: 0x222
tasks:
- sleep: 1000
`;

      expect(() => parseYamlScript(yamlContent)).toThrow();
    });

    test('legal android deviceId', () => {
      const yamlContent = `
android:
  deviceId: '0aacde222'
tasks:
- sleep: 1000
`;

      const result = parseYamlScript(yamlContent);
      expect(result.android?.deviceId).toBe('0aacde222');
    });

    test('aiRightClick', () => {
      const yamlContent = `
target:
  url: "sample_url"
tasks:
  - sleep: 1000
  - aiTap: "sample_button"
  - aiRightClick: "context menu trigger"
  - aiInput:
      locate: "email input"
      aiInput: "test@example.com"
`;

      const result = parseYamlScript(yamlContent);
      expect(result).toMatchSnapshot();
    });
  });
});
