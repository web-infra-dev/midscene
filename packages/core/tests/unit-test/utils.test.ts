import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import * as fs from 'node:fs';
import {
  adaptDoubaoBbox,
  adaptQwenBbox,
  expandSearchArea,
  mergeRects,
} from '@/ai-model/common';
import {
  extractJSONFromCodeBlock,
  preprocessDoubaoBboxJson,
  safeParseJson,
} from '@/ai-model/service-caller';
import { getMidsceneRunSubDir } from '@midscene/shared/common';
import {
  getAIConfig,
  overrideAIConfig,
  vlLocateMode,
} from '@midscene/shared/env';
import { describe, expect, it } from 'vitest';
import { reportHTMLContent, writeDumpReport } from '../../dist/es/utils'; // use modules from dist, otherwise we will miss the template file
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
    const content = randomUUID();
    const reportPath = writeDumpReport('test', content);
    expect(reportPath).toBeTruthy();
    const reportContent = readFileSync(reportPath!, 'utf-8');
    expect(reportContent).contains(content);
  });

  it('write report file with empty dump', () => {
    const reportPath = writeDumpReport('test', '');
    expect(reportPath).toBeTruthy();
    const reportContent = readFileSync(reportPath!, 'utf-8');
    expect(reportContent).contains('type="midscene_web_dump"');
  });

  it('write report file with attributes', () => {
    const content = randomUUID();
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

    const content = randomUUID();
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
    const content = JSON.stringify({ test: randomUUID() });
    const reportPathB = reportHTMLContent(content, tmpFile);
    expect(reportPathB).toBe(tmpFile);
    const fileContentB = readFileSync(tmpFile, 'utf-8');
    expect(fileContentB).toContain(
      `<script type="midscene_web_dump" type="application/json">\n${content}\n</script>`,
    );

    // test array with attributes
    const uuid1 = randomUUID();
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
    { timeout: 30000 },
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
  it('adaptDoubaoBbox', () => {
    const result = adaptDoubaoBbox([[100, 200, 300, 400]] as any, 400, 900);
    expect(result).toMatchInlineSnapshot(`
      [
        40,
        180,
        120,
        360,
      ]
    `);
  });
  it('adaptDoubaoBbox', () => {
    const result = adaptDoubaoBbox(
      [
        [100, 200, 300, 400],
        [100, 200, 300, 400],
      ] as any,
      400,
      900,
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

  it('expandSearchArea', () => {
    const result = expandSearchArea(
      { left: 100, top: 100, width: 100, height: 100 },
      { width: 1000, height: 1000 },
    );

    // Dynamic expectation based on vlLocateMode
    const isDoubaoVision = vlLocateMode() === 'doubao-vision';
    const expectedSize = isDoubaoVision ? 500 : 300;

    expect(result).toEqual({
      height: expectedSize,
      left: 0,
      top: 0,
      width: expectedSize,
    });
  });

  it('expandSearchArea with a big rect', () => {
    const result = expandSearchArea(
      { left: 100, top: 100, width: 500, height: 500 },
      { width: 1000, height: 1000 },
    );
    expect(result).toMatchInlineSnapshot(`
      {
        "height": 820,
        "left": 0,
        "top": 0,
        "width": 820,
      }
    `);
  });

  it('expandSearchArea with a right-most rect', () => {
    const result = expandSearchArea(
      { left: 951, top: 800, width: 50, height: 50 },
      { width: 1000, height: 1000 },
    );

    // Dynamic expectation based on vlLocateMode
    const isDoubaoVision = vlLocateMode() === 'doubao-vision';

    if (isDoubaoVision) {
      // minEdgeSize = 500, paddingSize = 225
      expect(result).toEqual({
        height: 425, // min(50 + 225*2, 1000 - 575) = min(500, 425) = 425
        left: 726, // max(0, 951 - 225) = 726
        top: 575, // max(0, 800 - 225) = 575
        width: 274, // min(50 + 225*2, 1000 - 726) = min(500, 274) = 274
      });
    } else {
      // minEdgeSize = 300, paddingSize = 125
      expect(result).toEqual({
        height: 300, // min(50 + 125*2, 1000 - 675) = min(300, 325) = 300
        left: 826, // max(0, 951 - 125) = 826
        top: 675, // max(0, 800 - 125) = 675
        width: 174, // min(50 + 125*2, 1000 - 826) = min(300, 174) = 174
      });
    }
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
});
