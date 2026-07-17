import { getModelAdapter } from '@/ai-model/models';
import {
  extractJSONFromCodeBlock,
  parseModelResponseJson,
} from '@/ai-model/service-caller/json';
import { describe, expect, it } from '@rstest/core';

describe('extractJSONFromCodeBlock', () => {
  it('should extract JSON from a direct JSON object', () => {
    const input = '{ "key": "value" }';
    const result = extractJSONFromCodeBlock(input);
    expect(result).toBe('{ "key": "value" }');
  });

  it('should extract JSON from a code block with json language specifier', () => {
    const input = '```json\n{ "key": "value" }\n```';
    const result = extractJSONFromCodeBlock(input);
    expect(result).toBe('{ "key": "value" }');

    const input2 = '  ```JSON\n{ "key": "value" }\n```';
    const result2 = extractJSONFromCodeBlock(input2);
    expect(result2).toBe('{ "key": "value" }');
  });

  it('should extract JSON from a code block without language specifier', () => {
    const input = '```\n{ "key": "value" }\n```';
    const result = extractJSONFromCodeBlock(input);
    expect(result).toBe('{ "key": "value" }');
  });

  it('should extract JSON-like structure from text', () => {
    const input = 'Some text { "key": "value" } more text';
    const result = extractJSONFromCodeBlock(input);
    expect(result).toBe('{ "key": "value" }');
  });

  it('should keep legacy greedy extraction for multiple JSON-like objects', () => {
    const input = 'first { "a": 1 } second { "b": 2 }';
    const result = extractJSONFromCodeBlock(input);

    expect(result).toBe('{ "a": 1 } second { "b": 2 }');
  });

  it('should return the original response if no JSON structure is found', () => {
    const input = 'This is just plain text';
    const result = extractJSONFromCodeBlock(input);
    expect(result).toBe('This is just plain text');
  });

  it('should handle multi-line JSON objects', () => {
    const input = `{
      "key1": "value1",
      "key2": {
        "nestedKey": "nestedValue"
      }
    }`;
    const result = extractJSONFromCodeBlock(input);
    expect(result).toBe(input);
  });
});

describe('parseModelResponseJson', () => {
  const parseJson = (
    input: string,
    modelFamily?: Parameters<typeof getModelAdapter>[0],
  ): any =>
    modelFamily === undefined
      ? parseModelResponseJson(input)
      : getModelAdapter(modelFamily).jsonParser(input, {
          source: 'generic-object',
        });

  it('should parse valid JSON string', () => {
    const input = '{"key": "value"}';
    const result = parseModelResponseJson(input);
    expect(result).toEqual({ key: 'value' });
  });

  it('should parse dirty JSON that jsonrepair can fix', () => {
    const input = "{key: 'value'}";
    const result = parseModelResponseJson(input);
    expect(result).toEqual({ key: 'value' });
  });

  it('should throw error for unparseable content', () => {
    const input = '{foo: true false}';
    expect(() => parseModelResponseJson(input)).toThrow(
      /failed to parse LLM response into JSON/,
    );
  });

  it('should reject top-level non-object JSON values', () => {
    expect(() => parseModelResponseJson('[1, 2]')).toThrow(
      /expected parsed LLM response to be a JSON object/,
    );
  });

  it('should allow top-level non-object JSON values when object validation is disabled', () => {
    expect(
      parseModelResponseJson('[" todo 1 ", " todo 2 "]', {
        source: 'generic-object',
        requireObject: false,
      }),
    ).toEqual(['todo 1', 'todo 2']);

    expect(
      parseModelResponseJson('" todo list "', {
        source: 'generic-object',
        requireObject: false,
      }),
    ).toBe('todo list');

    expect(
      parseModelResponseJson('42', {
        source: 'generic-object',
        requireObject: false,
      }),
    ).toBe(42);
  });

  it('should parse JSON from code block', () => {
    const input = '```json\n{"key": "value"}\n```';
    const result = parseModelResponseJson(input);
    expect(result).toEqual({ key: 'value' });
  });

  it('should parse complex nested JSON', () => {
    const input = `{
      "string": "value",
      "number": 123,
      "boolean": true,
      "array": [1, 2, 3],
      "object": {
        "nested": "value"
      }
    }`;
    const result = parseModelResponseJson(input);
    expect(result).toEqual({
      string: 'value',
      number: 123,
      boolean: true,
      array: [1, 2, 3],
      object: {
        nested: 'value',
      },
    });
  });

  it('should trim leading and trailing spaces from object keys', () => {
    const input =
      '{"  type  ": "Tap", "param": {"  prompt  ": "Login button"}}';
    const result = parseJson(input);

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
    const result = parseJson(input);

    expect(result.type).toBe('Tap');
  });

  it('should trim leading and trailing spaces from prompt field values', () => {
    const input = '{"param": {"prompt": "  Click the button  "}}';
    const result = parseJson(input);

    expect(result.param.prompt).toBe('Click the button');
  });

  it('should handle the original error case with leading spaces', () => {
    const input =
      '{"type":" Tap","param":{"locate":{"bbox":[574,308,865,352]," prompt ":"The \'Login\' button"}}}';
    const result = parseJson(input);

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

  it('should repair bare quotes inside planning action prompt strings', () => {
    const input = `{
  "locate": {
    "prompt": "搜索输入框，当前显示文本为"世界杯 7 队仍保持不败战绩"",
    "bbox": [120, 200, 780, 260]
  }
}`;
    const result = parseModelResponseJson(input, {
      source: 'planning-action-param',
    });

    expect(result).toEqual({
      locate: {
        prompt: '搜索输入框，当前显示文本为"世界杯 7 队仍保持不败战绩"',
        bbox: [120, 200, 780, 260],
      },
    });
  });

  it('should handle nested objects and arrays', () => {
    const input = JSON.stringify({
      ' type ': '  Tap  ',
      ' items ': [{ '  name  ': '  item1  ' }, { '  name  ': '  item2  ' }],
    });
    const result = parseJson(input);

    expect(result).toEqual({
      type: 'Tap',
      items: [{ name: 'item1' }, { name: 'item2' }],
    });
  });

  it('should trim string values inside arrays', () => {
    const input = '{"items": ["  first  ", " second "]}';
    const result = parseJson(input);

    expect(result).toEqual({
      items: ['first', 'second'],
    });
  });

  it('should trim all string values including descriptions', () => {
    const input =
      '{"type": "  Tap  ", "description": "  Some text with spaces  "}';
    const result = parseJson(input);

    expect(result.type).toBe('Tap');
    expect(result.description).toBe('Some text with spaces');
  });

  it('should preserve configured string value keys while trimming other fields', () => {
    const input =
      '{" value ": "  test value  ", "param": {" prompt ": "  input field  "}}';
    const result = parseModelResponseJson(input, {
      source: 'generic-object',
      preserveStringValueKeys: ['value'],
    });

    expect(result).toEqual({
      value: '  test value  ',
      param: {
        prompt: 'input field',
      },
    });
  });

  it('should preserve configured string value keys from JSON code blocks', () => {
    const input = `\`\`\`json
{
  "value": "  test value  ",
  "locate": {
    "prompt": "  input field  "
  }
}
\`\`\``;
    const result = parseModelResponseJson(input, {
      source: 'generic-object',
      preserveStringValueKeys: ['value'],
    });

    expect(result).toEqual({
      value: '  test value  ',
      locate: {
        prompt: 'input field',
      },
    });
  });

  it('should preserve configured string value keys after jsonrepair', () => {
    const input =
      '{ value: "  test value  ", locate: {" prompt ": "  input field  ",}, }';
    const result = parseModelResponseJson(input, {
      source: 'generic-object',
      preserveStringValueKeys: ['value'],
    });

    expect(result).toEqual({
      value: '  test value  ',
      locate: {
        prompt: 'input field',
      },
    });
  });

  it('should handle null values', () => {
    const input = '{"type": "Tap", "value": null, "param": {}}';
    const result = parseJson(input);

    expect(result.type).toBe('Tap');
    expect(result.value).toBeNull();
  });

  it('should work with malformed JSON that jsonrepair can fix', () => {
    const input = '{type: " Tap ", param: {" prompt ": "Login"}}';
    const result = parseJson(input);

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
    const result = parseJson(input);

    expect(result.type).toBe('Action');
    expect(result.nested.level1.level2.prompt).toBe('deep value');
  });

  it('should trim id field values', () => {
    const input = '{"id": "  element-123  ", "type": "  Tap  "}';
    const result = parseJson(input);

    expect(result.id).toBe('element-123');
    expect(result.type).toBe('Tap');
  });

  it('should handle a single object wrapped in an array through legacy extraction', () => {
    const input = '[{"  type  ": "  Tap  "}]';
    const result = parseJson(input);

    expect(result).toEqual({ type: 'Tap' });
  });

  it('should preserve coordinate tuple text inside valid JSON strings', () => {
    const input = '{"message": "target is near (100,200)"}';
    const result = parseJson(input);

    expect(result).toEqual({ message: 'target is near (100,200)' });
  });

  it('should work with doubao-vision mode and trim spaces', () => {
    const input = '{"  type  ": "  Tap  ", "param": {"  prompt  ": "Click"}}';
    const result = parseJson(input, 'doubao-vision');

    expect(result.type).toBe('Tap');
    expect(result.param.prompt).toBe('Click');
  });
});
