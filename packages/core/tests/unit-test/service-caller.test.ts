import { getModelAdapter } from '@/ai-model/models';
import { safeParseJson } from '@/ai-model/service-caller/json';
import { describe, expect, it } from 'vitest';

describe('service-caller', () => {
  const parseJson = (
    input: string,
    modelFamily: Parameters<typeof getModelAdapter>[0],
  ) =>
    modelFamily === undefined
      ? safeParseJson(input)
      : getModelAdapter(modelFamily).jsonParser(input, {
          source: 'generic-object',
        });

  describe('adapter json parser - JSON normalization', () => {
    it('should trim leading and trailing spaces from object keys', () => {
      const input =
        '{"  type  ": "Tap", "param": {"  prompt  ": "Login button"}}';
      const result = parseJson(input, undefined);

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
      const result = parseJson(input, undefined);

      expect(result.type).toBe('Tap');
    });

    it('should trim leading and trailing spaces from prompt field values', () => {
      const input = '{"param": {"prompt": "  Click the button  "}}';
      const result = parseJson(input, undefined);

      expect(result.param.prompt).toBe('Click the button');
    });

    it('should handle the original error case with leading spaces', () => {
      // This is the actual error case from the issue
      // Note: extractJSONFromCodeBlock extracts the first object from an array string
      const input =
        '[{"type":" Tap","param":{"locate":{"bbox":[574,308,865,352]," prompt ":"The \'Login\' button"}}}]';
      const result = parseJson(input, undefined);

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
      const result = parseJson(input, undefined);

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
      const result = parseJson(input, undefined);

      expect(result.type).toBe('Tap');
      expect(result.description).toBe('Some text with spaces'); // All strings are trimmed
    });

    it('should handle null and undefined values', () => {
      const input = '{"type": "Tap", "value": null, "param": {}}';
      const result = parseJson(input, undefined);

      expect(result.type).toBe('Tap');
      expect(result.value).toBeNull();
    });

    it('should work with malformed JSON that jsonrepair can fix', () => {
      // jsonrepair can fix missing quotes, trailing commas, etc.
      const input = '{type: " Tap ", param: {" prompt ": "Login"}}';
      const result = parseJson(input, undefined);

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
      const result = parseJson(input, undefined);

      expect(result.type).toBe('Action');
      expect(result.nested.level1.level2.prompt).toBe('deep value');
    });

    it('should trim id field values', () => {
      const input = '{"id": "  element-123  ", "type": "  Tap  "}';
      const result = parseJson(input, undefined);

      expect(result.id).toBe('element-123');
      expect(result.type).toBe('Tap');
    });

    it('should handle arrays of actions with spaces', () => {
      const input = '[{"  type  ": "  Tap  "}, {"  type  ": "  Hover  "}]';
      const result = parseJson(input, undefined);

      expect(result).toEqual([{ type: 'Tap' }, { type: 'Hover' }]);
    });

    it('should handle coordinate tuples without breaking them', () => {
      const input = '(100,200)';
      const result = parseJson(input, undefined);

      // This should match coordinates pattern and return array
      expect(result).toEqual([100, 200]);
    });

    it('should work with doubao-vision mode and trim spaces', () => {
      // Test that normalization works correctly even when modelFamily is set
      const input = '{"  type  ": "  Tap  ", "param": {"  prompt  ": "Click"}}';
      const result = parseJson(input, 'doubao-vision');

      expect(result.type).toBe('Tap');
      expect(result.param.prompt).toBe('Click');
    });
  });
});
