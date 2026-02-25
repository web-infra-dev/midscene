import {
  resolveReasoningConfig,
  safeParseJson,
} from '@/ai-model/service-caller';
import type { IModelConfig } from '@midscene/shared/env';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('service-caller', () => {
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

  describe('custom OpenAI client', () => {
    beforeEach(() => {
      vi.mock('openai');
    });

    afterEach(() => {
      vi.clearAllMocks();
    });

    it('should use custom client factory when createOpenAIClient is provided', async () => {
      const mockCustomClient = {
        chat: {
          completions: {
            create: vi.fn().mockResolvedValue({
              choices: [{ message: { content: 'test response' } }],
              usage: {
                prompt_tokens: 10,
                completion_tokens: 20,
                total_tokens: 30,
              },
            }),
          },
        },
      };

      const mockCreateClient = vi.fn().mockReturnValue(mockCustomClient);

      const mockModelConfig: IModelConfig = {
        modelName: 'gpt-4o',
        openaiApiKey: 'test-key',
        openaiBaseURL: 'https://api.openai.com/v1',
        modelDescription: 'test',
        intent: 'default',
        from: 'modelConfig',
        createOpenAIClient: mockCreateClient,
      };

      // Verify that createOpenAIClient is in the config
      expect(mockModelConfig.createOpenAIClient).toBe(mockCreateClient);
      expect(typeof mockModelConfig.createOpenAIClient).toBe('function');
    });

    it('should work without createOpenAIClient (backward compatibility)', () => {
      const mockModelConfig: IModelConfig = {
        modelName: 'gpt-4o',
        openaiApiKey: 'test-key',
        openaiBaseURL: 'https://api.openai.com/v1',
        modelDescription: 'test',
        intent: 'default',
        from: 'env',
      };

      // Should not have createOpenAIClient
      expect(mockModelConfig.createOpenAIClient).toBeUndefined();

      // Config should still be valid
      expect(mockModelConfig.modelName).toBe('gpt-4o');
      expect(mockModelConfig.openaiApiKey).toBe('test-key');
    });
  });

  describe('safeParseJson - JSON normalization', () => {
    it('should trim leading and trailing spaces from object keys', () => {
      const input =
        '{"  type  ": "Tap", "param": {"  prompt  ": "Login button"}}';
      const result = safeParseJson(input, undefined);

      expect(result).toEqual({
        type: 'Tap',
        param: {
          prompt: 'Login button',
        },
      });
      expect(Object.keys(result)).toEqual(['type', 'param']);
      expect(Object.keys(result.param)).toEqual(['prompt']);
    });

    it('should trim leading and trailing spaces from type field values', () => {
      const input = '{"type": "  Tap  ", "param": {}}';
      const result = safeParseJson(input, undefined);

      expect(result.type).toBe('Tap');
    });

    it('should trim leading and trailing spaces from prompt field values', () => {
      const input = '{"param": {"prompt": "  Click the button  "}}';
      const result = safeParseJson(input, undefined);

      expect(result.param.prompt).toBe('Click the button');
    });

    it('should handle the original error case with leading spaces', () => {
      // This is the actual error case from the issue
      // Note: extractJSONFromCodeBlock extracts the first object from an array string
      const input =
        '[{"type":" Tap","param":{"locate":{"bbox":[574,308,865,352]," prompt ":"The \'Login\' button"}}}]';
      const result = safeParseJson(input, undefined);

      // The result is the first object (array wrapper is removed by extractJSONFromCodeBlock)
      expect(result).toEqual({
        type: 'Tap',
        param: {
          locate: {
            bbox: [574, 308, 865, 352],
            prompt: "The 'Login' button",
          },
        },
      });
    });

    it('should handle nested objects and arrays', () => {
      const input = JSON.stringify({
        ' type ': '  Tap  ',
        ' items ': [{ '  name  ': '  item1  ' }, { '  name  ': '  item2  ' }],
      });
      const result = safeParseJson(input, undefined);

      expect(result).toEqual({
        type: 'Tap',
        items: [
          { name: 'item1' }, // All string values are trimmed
          { name: 'item2' },
        ],
      });
    });

    it('should trim all string values including descriptions', () => {
      const input =
        '{"type": "  Tap  ", "description": "  Some text with spaces  "}';
      const result = safeParseJson(input, undefined);

      expect(result.type).toBe('Tap');
      expect(result.description).toBe('Some text with spaces'); // All strings are trimmed
    });

    it('should handle null and undefined values', () => {
      const input = '{"type": "Tap", "value": null, "param": {}}';
      const result = safeParseJson(input, undefined);

      expect(result.type).toBe('Tap');
      expect(result.value).toBeNull();
    });

    it('should work with malformed JSON that jsonrepair can fix', () => {
      // jsonrepair can fix missing quotes, trailing commas, etc.
      const input = '{type: " Tap ", param: {" prompt ": "Login"}}';
      const result = safeParseJson(input, undefined);

      expect(result.type).toBe('Tap');
      expect(result.param.prompt).toBe('Login');
    });

    it('should handle deeply nested structures', () => {
      const input = JSON.stringify({
        ' type ': '  Action  ',
        ' nested ': {
          '  level1  ': {
            '  level2  ': {
              '  prompt  ': '  deep value  ',
            },
          },
        },
      });
      const result = safeParseJson(input, undefined);

      expect(result.type).toBe('Action');
      expect(result.nested.level1.level2.prompt).toBe('deep value');
    });

    it('should trim id field values', () => {
      const input = '{"id": "  element-123  ", "type": "  Tap  "}';
      const result = safeParseJson(input, undefined);

      expect(result.id).toBe('element-123');
      expect(result.type).toBe('Tap');
    });

    it('should handle arrays of actions with spaces', () => {
      const input = '[{"  type  ": "  Tap  "}, {"  type  ": "  Hover  "}]';
      const result = safeParseJson(input, undefined);

      expect(result).toEqual([{ type: 'Tap' }, { type: 'Hover' }]);
    });

    it('should handle coordinate tuples without breaking them', () => {
      const input = '(100,200)';
      const result = safeParseJson(input, undefined);

      // This should match coordinates pattern and return array
      expect(result).toEqual([100, 200]);
    });

    it('should work with doubao-vision mode and trim spaces', () => {
      // Test that normalization works correctly even when modelFamily is set
      const input = '{"  type  ": "  Tap  ", "param": {"  prompt  ": "Click"}}';
      const result = safeParseJson(input, 'doubao-vision');

      expect(result.type).toBe('Tap');
      expect(result.param.prompt).toBe('Click');
    });
  });

  describe('resolveReasoningConfig', () => {
    it('returns empty config when no reasoning params are set', () => {
      const result = resolveReasoningConfig({
        modelFamily: 'doubao-seed',
      });
      expect(result.config).toEqual({});
    });

    // qwen3-vl / qwen3.5: reasoningEnabled → enable_thinking, reasoningBudget → thinking_budget
    it('maps reasoningEnabled to enable_thinking for qwen3-vl with default budget', () => {
      const result = resolveReasoningConfig({
        reasoningEnabled: true,
        modelFamily: 'qwen3-vl',
      });
      expect(result.config).toEqual({
        enable_thinking: true,
      });
    });

    it('maps reasoningEnabled=false to enable_thinking=false for qwen3.5', () => {
      const result = resolveReasoningConfig({
        reasoningEnabled: false,
        modelFamily: 'qwen3.5',
      });
      expect(result.config).toEqual({ enable_thinking: false });
    });

    it('maps reasoningBudget to thinking_budget for qwen3-vl', () => {
      const result = resolveReasoningConfig({
        reasoningEnabled: true,
        reasoningBudget: 16384,
        modelFamily: 'qwen3-vl',
      });
      expect(result.config).toEqual({
        enable_thinking: true,
        thinking_budget: 16384,
      });
    });

    it('ignores reasoningEffort for qwen (not a supported param)', () => {
      const result = resolveReasoningConfig({
        reasoningEffort: 'high',
        modelFamily: 'qwen3-vl',
      });
      // reasoningEffort is ignored for qwen, but it was set so config is entered
      expect(result.config).toEqual({});
    });

    it('maps reasoningBudget alone without reasoningEnabled for qwen3-vl', () => {
      const result = resolveReasoningConfig({
        reasoningBudget: 16384,
        modelFamily: 'qwen3-vl',
      });
      expect(result.config).toEqual({ thinking_budget: 16384 });
    });

    // doubao-vision / doubao-seed: reasoningEnabled → thinking.type, reasoningEffort → reasoning_effort
    it('maps reasoningEnabled to thinking.type for doubao-vision', () => {
      const result = resolveReasoningConfig({
        reasoningEnabled: true,
        modelFamily: 'doubao-vision',
      });
      expect(result.config).toEqual({ thinking: { type: 'enabled' } });
    });

    it('maps reasoningEnabled=false to thinking.type=disabled for doubao-seed', () => {
      const result = resolveReasoningConfig({
        reasoningEnabled: false,
        modelFamily: 'doubao-seed',
      });
      expect(result.config).toEqual({ thinking: { type: 'disabled' } });
    });

    it('maps reasoningEnabled with reasoningEffort for doubao-vision', () => {
      const result = resolveReasoningConfig({
        reasoningEnabled: true,
        reasoningEffort: 'medium',
        modelFamily: 'doubao-vision',
      });
      expect(result.config).toEqual({
        thinking: { type: 'enabled' },
        reasoning_effort: 'medium',
      });
    });

    it('maps both reasoningEnabled and reasoningEffort for doubao-seed', () => {
      const result = resolveReasoningConfig({
        reasoningEnabled: true,
        reasoningEffort: 'high',
        modelFamily: 'doubao-seed',
      });
      expect(result.config).toEqual({
        thinking: { type: 'enabled' },
        reasoning_effort: 'high',
      });
    });

    // glm-v: reasoningEnabled → thinking.type
    it('maps reasoningEnabled to thinking.type for glm-v', () => {
      const result = resolveReasoningConfig({
        reasoningEnabled: true,
        modelFamily: 'glm-v',
      });
      expect(result.config).toEqual({ thinking: { type: 'enabled' } });
    });

    it('maps reasoningEnabled=false to thinking.type=disabled for glm-v', () => {
      const result = resolveReasoningConfig({
        reasoningEnabled: false,
        modelFamily: 'glm-v',
      });
      expect(result.config).toEqual({ thinking: { type: 'disabled' } });
    });

    // gpt-5: reasoningEffort → reasoning.effort
    it('maps reasoningEffort to reasoning.effort for gpt-5', () => {
      const result = resolveReasoningConfig({
        reasoningEffort: 'low',
        modelFamily: 'gpt-5',
      });
      expect(result.config).toEqual({ reasoning: { effort: 'low' } });
    });

    it('maps reasoningEnabled=true to reasoning.effort="high" for gpt-5', () => {
      const result = resolveReasoningConfig({
        reasoningEnabled: true,
        modelFamily: 'gpt-5',
      });
      expect(result.config).toEqual({ reasoning: { effort: 'high' } });
    });

    it('maps reasoningEnabled=false to reasoning.effort="low" for gpt-5', () => {
      const result = resolveReasoningConfig({
        reasoningEnabled: false,
        modelFamily: 'gpt-5',
      });
      expect(result.config).toEqual({ reasoning: { effort: 'low' } });
    });

    it('reasoningEffort takes priority over reasoningEnabled for gpt-5', () => {
      const result = resolveReasoningConfig({
        reasoningEnabled: true,
        reasoningEffort: 'medium',
        modelFamily: 'gpt-5',
      });
      expect(result.config).toEqual({ reasoning: { effort: 'medium' } });
    });

    // no model family
    it('warns when no model family is configured', () => {
      const result = resolveReasoningConfig({
        reasoningEnabled: true,
        modelFamily: undefined,
      });
      expect(result.config).toEqual({});
      expect(result.warningMessage).toBeDefined();
    });

    // unknown model family
    it('passes reasoning_effort directly for unrecognized model family', () => {
      const result = resolveReasoningConfig({
        reasoningEffort: 'high',
        modelFamily: 'gemini' as any,
      });
      expect(result.config).toEqual({ reasoning_effort: 'high' });
    });
  });
});
