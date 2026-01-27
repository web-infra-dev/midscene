import { existsSync, readFileSync, statSync } from 'node:fs';
import * as fs from 'node:fs';
import {
  extractJSONFromCodeBlock,
  preprocessDoubaoBboxJson,
  safeParseJson,
} from '@/ai-model/service-caller';
import {
  type MidsceneLocationResultType,
  adaptBbox,
  adaptBboxToRect,
  adaptDoubaoBbox,
  adaptGeminiBbox,
  adaptQwen2_5Bbox as adaptQwenBbox,
  computeBboxCenter,
  dumpActionParam,
  expandSearchArea,
  findAllMidsceneLocatorField,
  mergeRects,
  normalized01000,
  parseBboxToNumbers,
  pointToBbox,
} from '@/common';
import { type DeviceAction, getMidsceneLocationSchema } from '@/index';
import { getMidsceneRunSubDir } from '@midscene/shared/common';
import { uuid } from '@midscene/shared/utils';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
// @ts-ignore no types in es folder
import { reportHTMLContent, writeDumpReport } from '../../dist/es/utils'; // use modules from dist, otherwise we will miss the template file
import { ifPlanLocateParamIsBbox } from '../../src/agent/utils';
import {
  getTmpDir,
  getTmpFile,
  insertScriptBeforeClosingHtml,
  overlapped,
} from '../../src/utils';

function createTempHtmlFile(content: string): string {
  const filePath = getTmpFile('html');
  if (!filePath) {
    throw new Error('Failed to create temp html file');
  }
  fs.writeFileSync(filePath, content, 'utf8');
  return filePath;
}

describe('utils', () => {
  it('tmpDir', () => {
    const testDir = getTmpDir();
    expect(typeof testDir).toBe('string');

    const testFile = getTmpFile('txt');
    expect(testFile!.endsWith('.txt')).toBe(true);
  });

  it('log dir', () => {
    const dumpDir = getMidsceneRunSubDir('log');
    expect(dumpDir).toBeTruthy();
  });

  it('write report file', () => {
    const content = uuid();
    const reportPath = writeDumpReport('test', `{"foo": "${content}"}`);
    expect(reportPath).toBeTruthy();
    const reportContent = readFileSync(reportPath!, 'utf-8');
    expect(reportContent).contains(content);
  });

  it('write report file with empty dump', () => {
    const reportPath = writeDumpReport('test', '{}');
    expect(reportPath).toBeTruthy();
    const reportContent = readFileSync(reportPath!, 'utf-8');
    expect(reportContent).contains('type="midscene_web_dump"');
  });

  it('write report file with attributes', () => {
    const content = uuid();
    const reportPath = writeDumpReport('test', {
      dumpString: content,
      attributes: {
        foo: 'bar',
        hello: 'world',
      },
    });
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
    const reportA = reportHTMLContent('');
    expect(reportA).toContain(
      '<script type="midscene_web_dump" type="application/json">\n\n</script>',
    );

    const content = uuid();
    const reportB = reportHTMLContent(content);
    expect(reportB).toContain(
      `<script type="midscene_web_dump" type="application/json">\n${content}\n</script>`,
    );
  });

  it('reportHTMLContent with reportPath', () => {
    const tmpFile = createTempHtmlFile('');

    // test empty array
    const reportPathA = reportHTMLContent('', tmpFile);
    expect(reportPathA).toBe(tmpFile);
    const fileContentA = readFileSync(tmpFile, 'utf-8');
    expect(fileContentA).toContain(
      '<script type="midscene_web_dump" type="application/json">\n\n</script>',
    );

    // test string content
    const content = JSON.stringify({ test: uuid() });
    const reportPathB = reportHTMLContent(content, tmpFile);
    expect(reportPathB).toBe(tmpFile);
    const fileContentB = readFileSync(tmpFile, 'utf-8');
    expect(fileContentB).toContain(
      `<script type="midscene_web_dump" type="application/json">\n${content}\n</script>`,
    );

    // test array with attributes
    const uuid1 = uuid();
    const dumpArray = {
      dumpString: JSON.stringify({ id: uuid1 }),
      attributes: {
        test_attr: 'test_value',
        another_attr: 'another_value',
      },
    };

    const reportPathC = reportHTMLContent(dumpArray, tmpFile);
    expect(reportPathC).toBe(tmpFile);
    const fileContentC = readFileSync(tmpFile, 'utf-8');

    // verify the file content contains attributes and data
    expect(fileContentC).toContain('test_attr="test_value"');
    expect(fileContentC).toContain('another_attr="another_value"');
    expect(fileContentC).toContain(uuid1);
  });

  it(
    'should handle multiple large reports correctly',
    { timeout: 30000 },
    async () => {
      const tmpFile = createTempHtmlFile('');

      // Create a large string of approximately 100MB
      const generateLargeString = (sizeInMB: number, identifier: string) => {
        const approximateCharsPer1MB = 1024 * 1024; // 1MB in characters
        const totalChars = approximateCharsPer1MB * sizeInMB;

        // Create a basic JSON structure with a very large string
        const baseObj = {
          id: identifier,
          timestamp: new Date().toISOString(),
          data: 'X'.repeat(totalChars - 100), // subtract a small amount for the JSON structure
        };

        return JSON.stringify(baseObj);
      };

      // Monitor memory usage
      const startMemory = process.memoryUsage();
      const heapTotalBefore = startMemory.heapTotal / 1024 / 1024;
      const heapUsedBefore = startMemory.heapUsed / 1024 / 1024;
      console.log(
        'Memory usage before test:',
        `RSS: ${Math.round(startMemory.rss / 1024 / 1024)}MB, ` +
          `Heap Total: ${heapTotalBefore}MB, ` +
          `Heap Used: ${heapUsedBefore}MB`,
      );

      // Store start time
      const startTime = Date.now();

      // Generate 10 large reports (each ~100MB)
      const numberOfReports = 10;
      // Write the large reports
      for (let i = 0; i < numberOfReports; i++) {
        const reportPath = reportHTMLContent(
          {
            dumpString: generateLargeString(100, `large-report-${i + 1}`),
            attributes: {
              report_number: `${i + 1}`,
              report_size: '100MB',
            },
          },
          tmpFile,
          true,
        );
        expect(reportPath).toBe(tmpFile);
      }

      // Calculate execution time
      const executionTime = Date.now() - startTime;
      console.log(`Execution time: ${executionTime}ms`);

      // Check memory usage after test
      const endMemory = process.memoryUsage();
      const rssAfter = endMemory.rss / 1024 / 1024;
      const heapTotalAfter = endMemory.heapTotal / 1024 / 1024;
      const heapUsedAfter = endMemory.heapUsed / 1024 / 1024;
      console.log(
        'Memory usage after test:',
        `RSS: ${Math.round(rssAfter)}MB, ` +
          `Heap Total: ${heapTotalAfter}MB, ` +
          `Heap Used: ${heapUsedAfter}MB`,
      );

      // Check if file exists
      expect(existsSync(tmpFile)).toBe(true);

      // Verify file size is approximately (100MB * 10) + template size
      const stats = statSync(tmpFile);
      const fileSizeInMB = stats.size / (1024 * 1024);
      console.log(`File size: ${fileSizeInMB.toFixed(2)}MB`);

      await new Promise((resolve) => setTimeout(resolve, 5000));

      // We expect the file to be approximately 700MB plus template overhead
      const expectedMinSize = 1000; // 10 reports × 100MB
      expect(fileSizeInMB).toBeGreaterThan(expectedMinSize);
    },
  );

  it('reportHTMLContent array with xss', () => {
    const reportContent = reportHTMLContent({
      dumpString: '<script>alert("xss")</script>',
      attributes: {
        'data-midscene-id': '123',
      },
    });
    expect(reportContent).toBeTruthy();
    expect(reportContent).toContain('data-midscene-id="123"');
    expect(reportContent).toContain(
      `__midscene_lt__script__midscene_gt__alert("xss")__midscene_lt__/script__midscene_gt__`,
    );
    expect(reportContent).not.toContain('<script>alert("xss")</script>');
  });

  it('reportHTMLContent string with xss', () => {
    const reportContent = reportHTMLContent('<script>alert("xss")</script>');
    expect(reportContent).toBeTruthy();
    expect(reportContent).toContain(
      `__midscene_lt__script__midscene_gt__alert("xss")__midscene_lt__/script__midscene_gt__`,
    );
    expect(reportContent).not.toContain('<script>alert("xss")</script>');
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
    const result = safeParseJson(input, undefined);
    expect(result).toEqual([123, 456]);
  });

  it('should parse valid JSON string using JSON.parse', () => {
    const input = '{"key": "value"}';
    const result = safeParseJson(input, undefined);
    expect(result).toEqual({ key: 'value' });
  });

  it('should parse dirty JSON using dirty-json parser', () => {
    const input = "{key: 'value'}"; // Invalid JSON but valid dirty-json
    const result = safeParseJson(input, undefined);
    expect(result).toEqual({ key: 'value' });
  });

  it('should throw error for unparseable content', () => {
    const input = 'not a json at all';
    const result = safeParseJson(input, undefined);
    expect(result).toEqual(input);
  });

  it('should parse JSON from code block', () => {
    const input = '```json\n{"key": "value"}\n```';
    const result = safeParseJson(input, undefined);
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
    const result = safeParseJson(input, undefined);
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

describe('qwen-vl-2.5', () => {
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

  it('adaptBboxToRect - size exceed image size', () => {
    const result = adaptBboxToRect([100, 200, 1000, 2000], 1000, 1000);
    expect(result).toMatchInlineSnapshot(`
      {
        "height": 800,
        "left": 100,
        "top": 200,
        "width": 900,
      }
    `);
  });

  it('adaptBboxToRect - size exceed image size - 2', () => {
    const result = adaptBboxToRect(
      [158, 114, 526, 179],
      684,
      301,
      611,
      221,
      684,
      301,
      'qwen2.5-vl',
    );
    expect(result).toMatchInlineSnapshot(`
      {
        "height": 65,
        "left": 769,
        "top": 335,
        "width": 368,
      }
    `);
  });

  it('adaptBboxToRect - size exceed image size - 3', () => {
    const result = adaptBboxToRect(
      [25, 154, 153, 186],
      301,
      164,
      0,
      752,
      301,
      164,
      'qwen2.5-vl',
    );
    expect(result).toMatchInlineSnapshot(`
      {
        "height": 10,
        "left": 25,
        "top": 906,
        "width": 128,
      }
    `);
  });

  it('adaptBboxToRect - size exceed image size - 4', () => {
    const result = adaptBboxToRect(
      [25, 154, 153, 186],
      301,
      164,
      0,
      752,
      140,
      910,
      'qwen2.5-vl',
    );
    expect(result).toMatchInlineSnapshot(`
      {
        "height": 10,
        "left": 25,
        "top": 906,
        "width": 115,
      }
    `);
  });
});

describe('doubao-vision', () => {
  it('adaptDoubaoBbox', () => {
    const result = adaptDoubaoBbox([100, 200, 300, 400], 400, 900);
    expect(result).toMatchInlineSnapshot(`
      [
        40,
        180,
        120,
        360,
      ]
    `);
  });

  it('adaptDoubaoBbox with string bbox', () => {
    const result = adaptDoubaoBbox(['123 222', '789 100'], 1000, 2000);
    expect(result).toMatchInlineSnapshot(`
      [
        123,
        444,
        789,
        200,
      ]
    `);
  });

  it('adaptDoubaoBbox with string bbox', () => {
    const result = adaptDoubaoBbox(['123,222', '789, 100'], 1000, 2000);
    expect(result).toMatchInlineSnapshot(`
      [
        123,
        444,
        789,
        200,
      ]
    `);
  });
});

describe('adaptBbox - doubao normalization', () => {
  it('flattens single nested doubao bbox', () => {
    const result = adaptBbox(
      [[100, 200, 300, 400]] as any,
      400,
      900,
      400,
      900,
      'doubao-vision',
    );
    expect(result).toMatchInlineSnapshot(`
      [
        40,
        180,
        120,
        360,
      ]
    `);
  });

  it('flattens nested doubao bbox list by taking the first entry', () => {
    const result = adaptBbox(
      [
        [100, 200, 300, 400],
        [100, 200, 300, 400],
      ] as any,
      400,
      900,
      400,
      900,
      'doubao-vision',
    );
    expect(result).toMatchInlineSnapshot(`
      [
        40,
        180,
        120,
        360,
      ]
    `);
  });
});

describe('doubao-vision', () => {
  it('preprocessDoubaoBboxJson', () => {
    const input = 'bbox: [123 456]';
    const result = preprocessDoubaoBboxJson(input);
    expect(result).toMatchInlineSnapshot(`"bbox: [123,456]"`);

    const input2 = 'bbox: [1 4]';
    const result2 = preprocessDoubaoBboxJson(input2);
    expect(result2).toMatchInlineSnapshot(`"bbox: [1,4]"`);

    const input3 = 'bbox: [123 456]\nbbox: [789 100]';
    const result3 = preprocessDoubaoBboxJson(input3);
    expect(result3).toMatchInlineSnapshot(`
      "bbox: [123,456]
      bbox: [789,100]"
    `);

    const input4 = 'bbox: [123 456,789 100]';
    const result4 = preprocessDoubaoBboxJson(input4);
    expect(result4).toMatchInlineSnapshot(`"bbox: [123,456,789,100]"`);

    const input5 = 'bbox: [940 445 969 490]';
    const result5 = preprocessDoubaoBboxJson(input5);
    expect(result5).toMatchInlineSnapshot(`"bbox: [940,445,969,490]"`);

    const input6 = '123 345 11111';
    const result6 = preprocessDoubaoBboxJson(input6);
    expect(result6).toMatchInlineSnapshot(`"123 345 11111"`);

    const input7 = `
{
  "bbox": [
    "550 216",
    "550 216",
    "550 216",
    "550 216"
  ],
  "errors": []
}
    `;
    const result7 = preprocessDoubaoBboxJson(input7);
    expect(result7).toMatchInlineSnapshot(`
      "
      {
        "bbox": [
          "550,216",
          "550,216",
          "550,216",
          "550,216"
        ],
        "errors": []
      }
          "
    `);
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

describe('normalized-0-1000 and gemini', () => {
  it('normalized-0-1000', () => {
    const result = normalized01000([100, 150, 200, 250], 2000, 2000);
    expect(result).toMatchInlineSnapshot(`
      [
        200,
        300,
        400,
        500,
      ]
    `);
  });

  it('gemini', () => {
    const result = adaptGeminiBbox([100, 150, 200, 250], 2000, 2000);
    expect(result).toMatchInlineSnapshot(`
      [
        300,
        200,
        500,
        400,
      ]
    `);
  });
});

describe('pointToBbox', () => {
  it('should convert point to bbox in [0, 1000] space with default size (20)', () => {
    const bbox = pointToBbox(500, 500);
    expect(bbox).toEqual([490, 490, 510, 510]);
  });

  it('should convert point to bbox with custom size', () => {
    const bbox = pointToBbox(500, 500, 10);
    expect(bbox).toEqual([495, 495, 505, 505]);
  });

  it('should handle boundary at origin (0, 0)', () => {
    const bbox = pointToBbox(0, 0);
    expect(bbox[0]).toBe(0);
    expect(bbox[1]).toBe(0);
    expect(bbox[2]).toBe(10);
    expect(bbox[3]).toBe(10);
  });

  it('should handle boundary at max (1000, 1000)', () => {
    const bbox = pointToBbox(1000, 1000);
    expect(bbox[0]).toBe(990);
    expect(bbox[1]).toBe(990);
    expect(bbox[2]).toBe(1000);
    expect(bbox[3]).toBe(1000);
  });

  it('should clamp to [0, 1000] range', () => {
    const bbox = pointToBbox(5, 995);
    expect(bbox[0]).toBe(0);
    expect(bbox[1]).toBe(985);
    expect(bbox[2]).toBe(15);
    expect(bbox[3]).toBe(1000);
  });
});

describe('search area', () => {
  it('mergeRects', () => {
    const result = mergeRects([
      { left: 10, top: 10, width: 10, height: 500 },
      { left: 100, top: 100, width: 100, height: 100 },
    ]);
    expect(result).toMatchInlineSnapshot(`
      {
        "height": 500,
        "left": 10,
        "top": 10,
        "width": 190,
      }
    `);
  });

  describe('expandSearchArea', () => {
    it('should expand normal position rect to minimum size', () => {
      const result = expandSearchArea(
        { left: 100, top: 100, width: 100, height: 100 },
        { width: 1000, height: 1000 },
        undefined,
      );

      // For all modelFamily, minEdgeSize = 500, padding = 200 each side
      expect(result).toEqual({
        left: 0, // 100 - 200 = -100, clamped to 0
        top: 0, // 100 - 200 = -100, clamped to 0
        width: 500, // guaranteed minimum
        height: 500, // guaranteed minimum
      });
    });

    it('should expand normal position rect for doubao-vision', () => {
      const result = expandSearchArea(
        { left: 200, top: 200, width: 100, height: 100 },
        { width: 1000, height: 1000 },
        'doubao-vision',
      );

      // For doubao-vision, minEdgeSize = 500, padding = 200 each side
      expect(result).toEqual({
        left: 0, // 200 - 200 = 0
        top: 0, // 200 - 200 = 0
        width: 500, // guaranteed minimum
        height: 500, // guaranteed minimum
      });
    });

    it('should handle already large rect with default padding', () => {
      const result = expandSearchArea(
        { left: 100, top: 100, width: 500, height: 500 },
        { width: 1000, height: 1000 },
        undefined,
      );

      // rect is already > 300, so use defaultPadding = 160
      expect(result).toEqual({
        left: 0, // max(0, 100 - 160) = 0
        top: 0, // max(0, 100 - 160) = 0
        width: 820, // 500 + 160*2 = 820
        height: 820, // 500 + 160*2 = 820
      });
    });

    it('should handle left-most position', () => {
      const result = expandSearchArea(
        { left: 10, top: 100, width: 50, height: 50 },
        { width: 1000, height: 1000 },
        undefined,
      );

      // minEdgeSize = 500, padding = 225 each side
      expect(result).toEqual({
        left: 0, // max(0, 10 - 225) = 0
        top: 0, // max(0, 100 - 225) = 0
        width: 500, // minimum size
        height: 500, // minimum size
      });
    });

    it('should handle top-most position', () => {
      const result = expandSearchArea(
        { left: 100, top: 10, width: 50, height: 50 },
        { width: 1000, height: 1000 },
        undefined,
      );

      expect(result).toEqual({
        left: 0, // max(0, 100 - 225) = 0
        top: 0, // max(0, 10 - 225) = 0
        width: 500, // minimum size
        height: 500, // minimum size
      });
    });

    it('should handle right-most position', () => {
      const result = expandSearchArea(
        { left: 950, top: 100, width: 50, height: 50 },
        { width: 1000, height: 1000 },
        undefined,
      );

      // Original position would be: left: 950 - 225 = 725, width: 500
      // But 725 + 500 = 1225 > 1000, so shift left to 500
      expect(result).toEqual({
        left: 500, // 1000 - 500 = 500
        top: 0, // max(0, 100 - 225) = 0
        width: 500, // minimum size maintained
        height: 500, // minimum size
      });
    });

    it('should handle bottom-most position', () => {
      const result = expandSearchArea(
        { left: 100, top: 950, width: 50, height: 50 },
        { width: 1000, height: 1000 },
        undefined,
      );

      // Original position would be: top: 950 - 225 = 725, height: 500
      // But 725 + 500 = 1225 > 1000, so shift up to 500
      expect(result).toEqual({
        left: 0, // max(0, 100 - 225) = 0
        top: 500, // 1000 - 500 = 500
        width: 500, // minimum size
        height: 500, // minimum size maintained
      });
    });

    it('should handle corner position (bottom-right)', () => {
      const result = expandSearchArea(
        { left: 950, top: 950, width: 30, height: 30 },
        { width: 1000, height: 1000 },
        undefined,
      );

      expect(result).toEqual({
        left: 500, // 1000 - 500 = 500
        top: 500, // 1000 - 500 = 500
        width: 500, // minimum size maintained
        height: 500, // minimum size maintained
      });
    });

    it('should handle very small screen - cannot fit minimum size', () => {
      const result = expandSearchArea(
        { left: 50, top: 50, width: 20, height: 20 },
        { width: 200, height: 200 },
        undefined,
      );

      // Screen is 200x200, but minEdgeSize is 300
      // Should clamp to screen size
      expect(result).toEqual({
        left: 0,
        top: 0,
        width: 200, // clamped to screen width
        height: 200, // clamped to screen height
      });
    });

    it('should handle very small screen with doubao-vision', () => {
      const result = expandSearchArea(
        { left: 100, top: 100, width: 50, height: 50 },
        { width: 400, height: 400 },
        'doubao-vision',
      );

      // minEdgeSize = 500, but screen is only 400x400
      expect(result).toEqual({
        left: 0,
        top: 0,
        width: 400, // clamped to screen width
        height: 400, // clamped to screen height
      });
    });

    it('should handle rect larger than screen', () => {
      const result = expandSearchArea(
        { left: 0, top: 0, width: 150, height: 150 },
        { width: 100, height: 100 },
        undefined,
      );

      expect(result).toEqual({
        left: 0,
        top: 0,
        width: 100, // clamped to screen width
        height: 100, // clamped to screen height
      });
    });

    it('should handle edge case with minimum screen size', () => {
      const result = expandSearchArea(
        { left: 5, top: 5, width: 10, height: 10 },
        { width: 50, height: 50 },
        undefined,
      );

      expect(result).toEqual({
        left: 0,
        top: 0,
        width: 50, // entire screen width
        height: 50, // entire screen height
      });
    });

    it('should handle qwen-vl mode edge case', () => {
      const result = expandSearchArea(
        { left: 25, top: 891, width: 127, height: 23 },
        { width: 1900, height: 916 },
        'qwen2.5-vl',
      );

      expect(result).toMatchInlineSnapshot(`
        {
          "height": 501,
          "left": 0,
          "top": 415,
          "width": 501,
        }
      `);
    });
  });
});

describe('insertScriptBeforeClosingHtml', () => {
  it('should insert script before </html> in a standard HTML file', () => {
    const html = '<html>hello</html>';
    const filePath = createTempHtmlFile(html);
    insertScriptBeforeClosingHtml(filePath, '<script>test</script>');
    const result = fs.readFileSync(filePath, 'utf8');
    expect(result).toBe('<html>hello<script>test</script>\n</html>\n');
    fs.unlinkSync(filePath);
  });

  it('should work with large HTML file and </html> at the end', () => {
    const body = 'a'.repeat(5000);
    const html = `<html>${body}</html>`;
    const filePath = createTempHtmlFile(html);
    insertScriptBeforeClosingHtml(filePath, '<script>large</script>');
    const result = fs.readFileSync(filePath, 'utf8');
    expect(result.endsWith('<script>large</script>\n</html>\n')).toBe(true);
    fs.unlinkSync(filePath);
  });

  it('should throw if </html> is missing', () => {
    const html = '<html>no end tag';
    const filePath = createTempHtmlFile(html);
    expect(() =>
      insertScriptBeforeClosingHtml(filePath, '<script>fail</script>'),
    ).toThrow('No </html> found');
    fs.unlinkSync(filePath);
  });

  it('should support multi-line scriptContent', () => {
    const html = '<html>abc</html>';
    const script = '<script>\nconsole.log(1)\n</script>';
    const filePath = createTempHtmlFile(html);
    insertScriptBeforeClosingHtml(filePath, script);
    const result = fs.readFileSync(filePath, 'utf8');
    expect(result).toBe(
      '<html>abc<script>\nconsole.log(1)\n</script>\n</html>\n',
    );
    fs.unlinkSync(filePath);
  });

  it('should not increase memory usage significantly for large files (memory check)', async () => {
    const body = 'a'.repeat(50 * 1024 * 1024); // 50MB
    const html = `<html>${body}</html>`;
    const filePath = createTempHtmlFile(html);

    // write large file first, wait for memory release
    await new Promise((resolve) => setTimeout(resolve, 1000));
    const memBefore = process.memoryUsage().rss;

    insertScriptBeforeClosingHtml(filePath, '<script>large</script>');

    // wait for a while, ensure the insertion process ends
    await new Promise((resolve) => setTimeout(resolve, 1000));
    const memAfter = process.memoryUsage().rss;

    // allow at most 2MB growth
    expect(memAfter - memBefore).toBeLessThan(2 * 1024 * 1024);

    fs.unlinkSync(filePath);
  });

  it('calculate correct position for html contains chinese', () => {
    const html = `<!DOCTYPE html>
<html>
  <head>
    <title>Bug Case</title>
  </head>
  <body>
    <h1>Bug Case</h1>
  </body>
  <script>
    { "hello": "你好", "world": "世界" }
  </script>
</html>`;
    const filePath = createTempHtmlFile(html);
    insertScriptBeforeClosingHtml(filePath, '<script>large</script>');
    const result = fs.readFileSync(filePath, 'utf8');
    const expected = html.replace(
      '</html>',
      '<script>large</script>\n</html>\n',
    );

    // bug case:
    // - Expected
    // + Received
    //   <!DOCTYPE html>
    //   <html>
    //     <head>
    //       <title>Bug Case</title>
    //     </head>
    //     <body>
    //       <h1>Bug Case</h1>
    //     </body>
    //     <script>
    //       { "hello": "你好", "world": "世界" }
    // -   </script>
    // - <script>large</script>
    // +   </scri<script>large</script>
    //   </html>

    expect(result).toBe(expected);
    fs.unlinkSync(filePath);
  });

  it('findAllMidsceneLocatorField', () => {
    const result = findAllMidsceneLocatorField(
      z.object({
        a: getMidsceneLocationSchema(),
        b: z.string(),
        c: getMidsceneLocationSchema().optional().describe('ccccc'),
      }),
    );
    expect(result).toEqual(['a', 'c']);
  });

  it('findAllMidsceneLocatorField - non match', () => {
    const result = findAllMidsceneLocatorField(
      z.object({
        b: z.string(),
      }),
    );
    expect(result).toEqual([]);
  });

  it('findAllMidsceneLocatorField - requiredOnly parameter', () => {
    const schema = z.object({
      a: getMidsceneLocationSchema(),
      b: z.string(),
      c: getMidsceneLocationSchema().optional().describe('optional locator'),
      d: getMidsceneLocationSchema().describe('required locator'),
    });

    // Test default behavior (requiredOnly = false, should return all locator fields)
    const allResult = findAllMidsceneLocatorField(schema);
    expect(allResult).toEqual(['a', 'c', 'd']);

    // Test requiredOnly = false explicitly
    const allResultExplicit = findAllMidsceneLocatorField(schema, false);
    expect(allResultExplicit).toEqual(['a', 'c', 'd']);

    // Test requiredOnly = true (should only return required locator fields)
    const requiredOnlyResult = findAllMidsceneLocatorField(schema, true);
    expect(requiredOnlyResult).toEqual(['a', 'd']);
  });

  it('type of DeviceAction', () => {
    const action: DeviceAction<{
      locate: MidsceneLocationResultType;
      duration?: number;
      autoDismissKeyboard?: boolean;
    }> = {
      name: 'click',
      description: 'click the element',
      paramSchema: z.object({
        locate: getMidsceneLocationSchema(),
        duration: z.number().optional(),
        autoDismissKeyboard: z.boolean().optional(),
      }),
      call: async (param) => {
        console.log(param.duration);
      },
    };
  });
});

describe('dumpActionParam', () => {
  it('should handle various locator field scenarios', () => {
    const schema = z.object({
      foo: z.string(),
      locator1: getMidsceneLocationSchema(),
      locator2: getMidsceneLocationSchema().optional(),
      locator3: getMidsceneLocationSchema().optional(),
      bar: z.number(),
      baz: z.boolean().optional(),
    });

    // Test case 1: Valid locators with prompts
    const input1 = {
      foo: 'test',
      locator1: {
        midscene_location_field_flag: true,
        prompt: 'first locator',
        center: [100, 200],
        rect: { left: 50, top: 100, width: 100, height: 50 },
      },
      locator2: {
        midscene_location_field_flag: true,
        prompt: 'second locator',
        center: [200, 300],
        rect: { left: 150, top: 200, width: 100, height: 50 },
      },
      bar: 42,
      baz: true,
    };

    const result1 = dumpActionParam(input1, schema);
    expect(result1).toMatchInlineSnapshot(`
      {
        "bar": 42,
        "baz": true,
        "foo": "test",
        "locator1": "first locator",
        "locator2": "second locator",
      }
    `);

    // Test case 2: Missing optional locator
    const input2 = {
      foo: 'test2',
      locator1: {
        midscene_location_field_flag: true,
        prompt: 'only locator',
        center: [50, 100],
        rect: { left: 25, top: 50, width: 50, height: 25 },
      },
      bar: 24,
    };

    const result2 = dumpActionParam(input2, schema);
    expect(result2).toMatchInlineSnapshot(`
      {
        "bar": 24,
        "foo": "test2",
        "locator1": "only locator",
      }
    `);
  });

  it('should handle edge cases and invalid inputs', () => {
    const schema = z.object({
      foo: z.string(),
      locator1: getMidsceneLocationSchema(),
      locator2: getMidsceneLocationSchema().optional(),
      bar: z.number().optional(),
    });

    // Test case 1: Invalid locator value (string instead of object)
    const input1 = {
      foo: 'test',
      locator1: 'invalid_locator_value',
      bar: 123,
    };

    const result1 = dumpActionParam(input1, schema);
    expect(result1).toMatchInlineSnapshot(`
      {
        "bar": 123,
        "foo": "test",
        "locator1": "invalid_locator_value",
      }
    `);

    // Test case 2: Locator without prompt
    const input2 = {
      foo: 'test2',
      locator1: {
        midscene_location_field_flag: true,
        // missing prompt
        center: [100, 200],
        rect: { left: 50, top: 100, width: 100, height: 50 },
      },
      locator2: {
        midscene_location_field_flag: true,
        prompt: 'valid locator',
        center: [200, 300],
        rect: { left: 150, top: 200, width: 100, height: 50 },
      },
    };

    const result2 = dumpActionParam(input2, schema);
    expect(result2).toMatchInlineSnapshot(`
      {
        "foo": "test2",
        "locator1": {
          "center": [
            100,
            200,
          ],
          "midscene_location_field_flag": true,
          "rect": {
            "height": 50,
            "left": 50,
            "top": 100,
            "width": 100,
          },
        },
        "locator2": "valid locator",
      }
    `);

    // Test case 3: Empty object
    const emptySchema = z.object({
      foo: z.string().optional(),
      locator: getMidsceneLocationSchema().optional(),
    });
    const emptyInput = {};

    const result3 = dumpActionParam(emptyInput, emptySchema);
    expect(result3).toMatchInlineSnapshot('{}');
  });

  it('should handle non-locator fields unchanged', () => {
    const schema = z.object({
      stringField: z.string(),
      numberField: z.number(),
      booleanField: z.boolean(),
      optionalString: z.string().optional(),
      arrayField: z.array(z.string()),
      objectField: z.object({
        nested: z.string(),
      }),
    });

    const input = {
      stringField: 'test string',
      numberField: 42,
      booleanField: true,
      optionalString: 'optional value',
      arrayField: ['item1', 'item2'],
      objectField: {
        nested: 'nested value',
      },
    };

    const result = dumpActionParam(input, schema);
    expect(result).toMatchInlineSnapshot(`
      {
        "arrayField": [
          "item1",
          "item2",
        ],
        "booleanField": true,
        "numberField": 42,
        "objectField": {
          "nested": "nested value",
        },
        "optionalString": "optional value",
        "stringField": "test string",
      }
    `);
  });

  it('should return empty object when input is not a plain object', () => {
    const schema = z.object({
      name: z.string(),
    });

    // String input was causing the bug: "com.example.app" spread into {0: 'c', 1: 'o', ...}
    expect(dumpActionParam('com.example.app' as any, schema)).toEqual({});
    expect(dumpActionParam(['a', 'b', 'c'] as any, schema)).toEqual({});
    expect(dumpActionParam(null as any, schema)).toEqual({});
    expect(dumpActionParam(12345 as any, schema)).toEqual({});
  });
});

describe('ifPlanLocateParamIsBbox', () => {
  it('should return true when bbox is valid array with 4 elements', () => {
    const param = {
      prompt: 'test element',
      bbox: [100, 200, 300, 400] as [number, number, number, number],
    };
    expect(ifPlanLocateParamIsBbox(param)).toBe(true);
  });

  it('should return false when bbox is undefined', () => {
    const param = {
      prompt: 'test element',
    };
    expect(ifPlanLocateParamIsBbox(param)).toBe(false);
  });

  it('should return false when bbox is not an array', () => {
    const param = {
      prompt: 'test element',
      bbox: 'not an array' as any,
    };
    expect(ifPlanLocateParamIsBbox(param)).toBe(false);
  });

  it('should return false when bbox array length is not 4', () => {
    const param1 = {
      prompt: 'test element',
      bbox: [100, 200] as any,
    };
    expect(ifPlanLocateParamIsBbox(param1)).toBe(false);

    const param2 = {
      prompt: 'test element',
      bbox: [100, 200, 300] as any,
    };
    expect(ifPlanLocateParamIsBbox(param2)).toBe(false);

    const param3 = {
      prompt: 'test element',
      bbox: [100, 200, 300, 400, 500] as any,
    };
    expect(ifPlanLocateParamIsBbox(param3)).toBe(false);
  });

  it('should return false when bbox is null', () => {
    const param = {
      prompt: 'test element',
      bbox: null as any,
    };
    expect(ifPlanLocateParamIsBbox(param)).toBe(false);
  });
});

describe('parseBboxToNumbers', () => {
  it('should parse number array', () => {
    expect(parseBboxToNumbers([934, 93, 951, 118])).toEqual([
      934, 93, 951, 118,
    ]);
  });

  it('should parse string array with comma-separated values', () => {
    expect(parseBboxToNumbers(['100,200', '300,400'])).toEqual([
      100, 200, 300, 400,
    ]);
  });

  it('should parse string array with space-separated values', () => {
    expect(parseBboxToNumbers(['100 200', '300 400'])).toEqual([
      100, 200, 300, 400,
    ]);
  });

  it('should parse string', () => {
    expect(parseBboxToNumbers('100 200 300 400')).toEqual([100, 200, 300, 400]);
  });

  it('should flatten nested arrays', () => {
    expect(parseBboxToNumbers([[100, 200, 300, 400]] as any)).toEqual([
      100, 200, 300, 400,
    ]);
  });
});

describe('computeBboxCenter', () => {
  it('should compute precise center for the original bug case [934, 93, 951, 118] + 1280x860', () => {
    const center = computeBboxCenter([934, 93, 951, 118], 1280, 860);
    // ((934+951)/2) * 1280 / 1000 = 942.5 * 1.28 = 1206.4 → 1206
    // ((93+118)/2) * 860 / 1000 = 105.5 * 0.86 = 90.73 → 91
    expect(center).toEqual({ x: 1206, y: 91 });
  });

  it('should match naive calculation for even-width bbox', () => {
    // bbox with even width: [400, 200, 600, 400] on 1000x1000
    const center = computeBboxCenter([400, 200, 600, 400], 1000, 1000);
    // ((400+600)/2) * 1000 / 1000 = 500
    // ((200+400)/2) * 1000 / 1000 = 300
    expect(center).toEqual({ x: 500, y: 300 });
  });

  it('should handle gemini format [y1, x1, y2, x2]', () => {
    const center = computeBboxCenter(
      [100, 200, 300, 400],
      2000,
      2000,
      0,
      0,
      'gemini',
    );
    // x: ((200+400)/2) * 2000 / 1000 = 300 * 2 = 600
    // y: ((100+300)/2) * 2000 / 1000 = 200 * 2 = 400
    expect(center).toEqual({ x: 600, y: 400 });
  });

  it('should handle qwen2.5-vl pixel format', () => {
    const center = computeBboxCenter(
      [100, 200, 301, 401],
      1000,
      1000,
      0,
      0,
      'qwen2.5-vl',
    );
    // x: (100+301)/2 = 200.5 → 201 (already pixel)
    // y: (200+401)/2 = 300.5 → 301
    expect(center).toEqual({ x: 201, y: 301 });
  });

  it('should handle qwen2.5-vl point format (2 elements)', () => {
    const center = computeBboxCenter(
      [150, 250],
      1000,
      1000,
      0,
      0,
      'qwen2.5-vl',
    );
    // x: (150 + 150) / 2 = 150
    // y: (250 + 250) / 2 = 250
    expect(center).toEqual({ x: 150, y: 250 });
  });

  it('should handle doubao point format (2 elements, normalized 0-1000)', () => {
    const center = computeBboxCenter([500, 500], 2000, 2000);
    // point: x = 500 * 2000 / 1000 = 1000, y = 500 * 2000 / 1000 = 1000
    expect(center).toEqual({ x: 1000, y: 1000 });
  });

  it('should apply offset correctly', () => {
    const center = computeBboxCenter(
      [500, 500, 500, 500],
      1000,
      1000,
      100,
      200,
    );
    // center: x = 500 * 1000 / 1000 + 100 = 600
    // center: y = 500 * 1000 / 1000 + 200 = 700
    expect(center).toEqual({ x: 600, y: 700 });
  });

  it('should apply offset with the bug case', () => {
    const center = computeBboxCenter([934, 93, 951, 118], 1280, 860, 50, 30);
    // x: 1206 + 50 = 1256
    // y: 91 + 30 = 121
    expect(center).toEqual({ x: 1256, y: 121 });
  });

  it('should handle 3-element point format', () => {
    const center = computeBboxCenter([500, 300, 0], 2000, 2000);
    // 3 elements < 4, treated as point
    // x = 500 * 2000 / 1000 = 1000
    // y = 300 * 2000 / 1000 = 600
    expect(center).toEqual({ x: 1000, y: 600 });
  });
});
