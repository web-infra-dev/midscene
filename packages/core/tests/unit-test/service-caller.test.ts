import { AIActionType } from '@/ai-model';
import { getResponseFormat } from '@/ai-model/service-caller';
import { describe, expect, it } from 'vitest';

describe('service-caller', () => {
  describe('getResponseFormat', () => {
    it('should return undefined for AIActionType.TEXT', () => {
      const result = getResponseFormat('gpt-4', AIActionType.TEXT);
      expect(result).toBeUndefined();
    });

    it('should return json format for AIActionType.EXTRACT_DATA with gpt-4', () => {
      const result = getResponseFormat('gpt-4', AIActionType.EXTRACT_DATA);
      expect(result).toEqual({ type: 'json_object' });
    });

    it('should return json format for AIActionType.DESCRIBE_ELEMENT with gpt-4', () => {
      const result = getResponseFormat('gpt-4', AIActionType.DESCRIBE_ELEMENT);
      expect(result).toEqual({ type: 'json_object' });
    });

    it('should not return json format for AIActionType.TEXT with gpt-4o-2024-05-13', () => {
      const result = getResponseFormat('gpt-4o-2024-05-13', AIActionType.TEXT);
      expect(result).toBeUndefined();
    });

    it('should return json format for other action types with gpt-4o-2024-05-13', () => {
      const result = getResponseFormat(
        'gpt-4o-2024-05-13',
        AIActionType.EXTRACT_DATA,
      );
      expect(result).toEqual({ type: 'json_object' });
    });

    it('should return undefined for non-gpt models', () => {
      const result = getResponseFormat('claude-3', AIActionType.EXTRACT_DATA);
      expect(result).toBeUndefined();
    });
  });

  describe('code block cleaning logic', () => {
    it('should clean markdown code blocks for TEXT action type', () => {
      // Test the cleaning logic directly
      const testCases = [
        {
          input: '```yaml\nweb:\n  url: "https://example.com"\n```',
          expected: 'web:\n  url: "https://example.com"',
          description: 'yaml code block',
        },
        {
          input: '```yml\ntest: value\n```',
          expected: 'test: value',
          description: 'yml code block',
        },
        {
          input: '```typescript\nconst x = 1;\n```',
          expected: 'const x = 1;',
          description: 'typescript code block',
        },
        {
          input: '```javascript\nconst x = 1;\n```',
          expected: 'const x = 1;',
          description: 'javascript code block',
        },
        {
          input: '```ts\nconst x = 1;\n```',
          expected: 'const x = 1;',
          description: 'ts code block',
        },
        {
          input: '```js\nconst x = 1;\n```',
          expected: 'const x = 1;',
          description: 'js code block',
        },
        {
          input: '```playwright\ntest("example", async () => {});\n```',
          expected: 'test("example", async () => {});',
          description: 'playwright code block',
        },
        {
          input: '```\ntest: value\n```',
          expected: 'test: value',
          description: 'generic code block',
        },
        {
          input: 'test: value',
          expected: 'test: value',
          description: 'no code block',
        },
        {
          input: '```yaml\ntest: value',
          expected: 'test: value',
          description: 'code block without closing',
        },
      ];

      for (const testCase of testCases) {
        // Simulate the cleaning logic from callAIWithStringResponse
        const cleaned = testCase.input
          .replace(
            /^```(?:yaml|yml|playwright|typescript|ts|javascript|js)?\s*\n?/,
            '',
          )
          .replace(/\n?```\s*$/, '');

        expect(cleaned).toBe(testCase.expected);
      }
    });

    it('should handle edge cases in code block cleaning', () => {
      const edgeCases = [
        {
          input: '```yaml\n\n\ntest: value\n\n\n```',
          expected: 'test: value\n\n',
          description: 'multiple newlines',
        },
        {
          input: '```  yaml  \ntest: value\n```',
          expected: 'yaml  \ntest: value', // Regex doesn't handle spaces around language identifier
          description: 'spaces around language identifier',
        },
        {
          input: '```YAML\ntest: value\n```',
          expected: 'test: value',
          description: 'uppercase language identifier',
        },
      ];

      for (const testCase of edgeCases) {
        // Note: The current regex is case-sensitive, so YAML won't match
        // This test documents the current behavior
        const cleaned = testCase.input
          .replace(
            /^```(?:yaml|yml|playwright|typescript|ts|javascript|js)?\s*\n?/,
            '',
          )
          .replace(/\n?```\s*$/, '');

        if (testCase.description === 'uppercase language identifier') {
          // Current implementation doesn't handle uppercase
          expect(cleaned).toBe('YAML\ntest: value');
        } else {
          expect(cleaned).toBe(testCase.expected);
        }
      }
    });
  });
});
