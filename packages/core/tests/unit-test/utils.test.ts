import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import {
  adaptBboxToRect,
  adaptDoubaoBbox,
  adaptQwenBbox,
  expandSearchArea,
} from '@/ai-model/common';
import {
  extractJSONFromCodeBlock,
  preprocessDoubaoBboxJson,
  safeParseJson,
} from '@/ai-model/service-caller';
import { getAIConfig, overrideAIConfig, vlLocateMode } from '@/env';
import {
  getLogDir,
  getTmpDir,
  getTmpFile,
  overlapped,
  reportHTMLContent,
  setLogDir,
  writeDumpReport,
} from '@/utils';
import { describe, expect, it } from 'vitest';

describe('utils', () => {
  it('tmpDir', () => {
    const testDir = getTmpDir();
    expect(typeof testDir).toBe('string');

    const testFile = getTmpFile('txt');
    expect(testFile!.endsWith('.txt')).toBe(true);
  });

  it('log dir', () => {
    const dumpDir = getLogDir();
    expect(dumpDir).toBeTruthy();

    setLogDir(tmpdir());
    const dumpDir2 = getLogDir();
    expect(dumpDir2).toBe(tmpdir());
  });

  it('write report file', () => {
    const content = randomUUID();
    const reportPath = writeDumpReport('test', content);
    expect(reportPath).toBeTruthy();
    const reportContent = readFileSync(reportPath!, 'utf-8');
    expect(reportContent).contains(content);
  });

  it('write report file with empty dump', () => {
    const reportPath = writeDumpReport('test', []);
    expect(reportPath).toBeTruthy();
    const reportContent = readFileSync(reportPath!, 'utf-8');
    expect(reportContent).contains('type="midscene_web_dump"');
  });

  it('write report file with attributes', () => {
    const content = randomUUID();
    const reportPath = writeDumpReport('test', [
      {
        dumpString: content,
        attributes: {
          foo: 'bar',
          hello: 'world',
        },
      },
    ]);
    expect(reportPath).toBeTruthy();
    const reportContent = readFileSync(reportPath!, 'utf-8');
    expect(reportContent).contains(content);
    expect(reportContent).contains('foo="bar"');
    expect(reportContent).contains('hello="world"');
  });

  it('overlapped', () => {
    const container = { left: 100, top: 100, width: 100, height: 100 };
    const target = { left: 150, top: 150, width: 100, height: 100 };
    expect(overlapped(container, target)).toBeTruthy();

    const target2 = { left: 200, top: 200, width: 100, height: 100 };
    expect(overlapped(container, target2)).toBeFalsy();
  });

  it('reportHTMLContent', () => {
    const reportA = reportHTMLContent([]);
    expect(reportA).toContain(
      '<script type="midscene_web_dump" type="application/json"></script>',
    );

    const content = randomUUID();
    const reportB = reportHTMLContent(content);
    expect(reportB).toContain(
      `<script type="midscene_web_dump" type="application/json">${content}</script>`,
    );
  });
});

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

  it('should handle JSON with point coordinates', () => {
    const input = '(123,456)';
    const result = safeParseJson(input);
    expect(result).toEqual([123, 456]);
  });

  it('should parse valid JSON string using JSON.parse', () => {
    const input = '{"key": "value"}';
    const result = safeParseJson(input);
    expect(result).toEqual({ key: 'value' });
  });

  it('should parse dirty JSON using dirty-json parser', () => {
    const input = "{key: 'value'}"; // Invalid JSON but valid dirty-json
    const result = safeParseJson(input);
    expect(result).toEqual({ key: 'value' });
  });

  it('should throw error for unparseable content', () => {
    const input = 'not a json at all';
    const result = safeParseJson(input);
    expect(result).toEqual(input);
  });

  it('should parse JSON from code block', () => {
    const input = '```json\n{"key": "value"}\n```';
    const result = safeParseJson(input);
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
    const result = safeParseJson(input);
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
});

describe('qwen-vl', () => {
  it('adaptQwenBbox', () => {
    const result = adaptQwenBbox([100.3, 200.4, 301, 401]);
    expect(result).toEqual([100, 200, 301, 401]);
  });

  it('adaptQwenBbox with 2 points', () => {
    const result = adaptQwenBbox([100, 200]);
    expect(result).toEqual([100, 200, 120, 220]);
  });

  it('adaptQwenBbox with invalid bbox data', () => {
    expect(() => adaptQwenBbox([100])).toThrow();
  });

  it.skipIf(vlLocateMode() !== 'qwen-vl')('adaptBboxToRect', () => {
    const result = adaptBboxToRect([100, 200, 300, 400], 400, 900, 30, 60);
    expect(result).toMatchInlineSnapshot(`
      {
        "height": 200,
        "left": 130,
        "top": 260,
        "width": 200,
      }
    `);
  });
});

describe('doubao-vision', () => {
  it('preprocessDoubaoBboxJson', () => {
    const input = '123 456';
    const result = preprocessDoubaoBboxJson(input);
    expect(result).toBe('123,456');

    const input2 = '1 4';
    const result2 = preprocessDoubaoBboxJson(input2);
    expect(result2).toBe('1,4');

    const input3 = '123 456\n789 100';
    const result3 = preprocessDoubaoBboxJson(input3);
    expect(result3).toBe('123,456\n789,100');

    const input4 = '[123 456,789 100]';
    const result4 = preprocessDoubaoBboxJson(input4);
    expect(result4).toBe('[123,456,789,100]');
  });

  it('adaptDoubaoBbox with 2 points', () => {
    const result = adaptDoubaoBbox([100, 200], 1000, 2000);
    expect(result).toMatchInlineSnapshot(`
      [
        90,
        390,
        110,
        410,
      ]
    `);
  });

  it('adaptDoubaoBbox', () => {
    const result = adaptDoubaoBbox([100, 200, 300, 400], 1000, 2000);
    expect(result).toMatchInlineSnapshot(`
      [
        100,
        400,
        300,
        800,
      ]
    `);
  });

  it('adaptDoubaoBbox with 6 points', () => {
    const result2 = adaptDoubaoBbox([100, 200, 300, 400, 100, 200], 1000, 2000);
    expect(result2).toMatchInlineSnapshot(`
      [
        90,
        390,
        110,
        410,
      ]
    `);
  });

  it('adaptDoubaoBbox with 8 points', () => {
    const result3 = adaptDoubaoBbox(
      [100, 200, 300, 200, 300, 400, 100, 400],
      1000,
      2000,
    );
    expect(result3).toMatchInlineSnapshot(`
      [
        100,
        400,
        300,
        800,
      ]
    `);
  });

  it('adaptDoubaoBbox with invalid bbox data', () => {
    expect(() => adaptDoubaoBbox([100], 1000, 2000)).toThrow();
  });
});

describe('expandSearchArea', () => {
  it('expandSearchArea', () => {
    const result = expandSearchArea(
      { left: 100, top: 100, width: 100, height: 100 },
      { width: 1000, height: 1000 },
    );
    expect(result).toMatchInlineSnapshot(`
      {
        "height": 200,
        "left": 50,
        "top": 50,
        "width": 200,
      }
    `);
  });

  it('expandSearchArea with a big rect', () => {
    const result = expandSearchArea(
      { left: 100, top: 100, width: 500, height: 500 },
      { width: 1000, height: 1000 },
    );
    expect(result).toMatchInlineSnapshot(`
      {
        "height": 600,
        "left": 50,
        "top": 50,
        "width": 600,
      }
    `);
  });

  it('expandSearchArea with a right-most rect', () => {
    const result = expandSearchArea(
      { left: 951, top: 800, width: 50, height: 50 },
      { width: 1000, height: 1000 },
    );
    expect(result).toMatchInlineSnapshot(`
      {
        "height": 200,
        "left": 876,
        "top": 725,
        "width": 124,
      }
    `);
  });
});

describe('env', () => {
  it('getAIConfig', () => {
    const result = getAIConfig('NEVER_EXIST_CONFIG' as any);
    expect(result).toBeUndefined();
  });

  it('overrideAIConfig', () => {
    expect(() =>
      overrideAIConfig({
        MIDSCENE_CACHE: {
          foo: 123,
        } as any,
      }),
    ).toThrow();
  });
});
