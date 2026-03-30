import { mkdirSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { convertExecutionInlineJsonToReportDump } from '@/dump/execution-json-converter';
import { describe, expect, it } from 'vitest';

function getTmpDir(prefix: string): string {
  const dir = join(tmpdir(), `midscene-test-${prefix}-${Date.now()}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

describe('convertExecutionInlineJsonToReportDump', () => {
  it('should extract inline base64 screenshots and dedupe by content hash', () => {
    const tmp = getTmpDir('execution-inline-converter');
    try {
      const screenshotsDir = join(tmp, 'screenshots');
      const sameBase64 = 'data:image/png;base64,AAAA';
      const json = JSON.stringify({
        executions: [
          {
            tasks: [
              {
                uiContext: {
                  screenshot: { base64: sameBase64, capturedAt: 1 },
                },
              },
              {
                uiContext: {
                  screenshot: { base64: sameBase64, capturedAt: 2 },
                },
              },
            ],
          },
        ],
      });

      const converted = convertExecutionInlineJsonToReportDump({
        serializedExecutionJson: json,
        screenshotsDir,
        hashToRelativePath: new Map<string, string>(),
      });

      const parsed = JSON.parse(converted);
      const p1 = parsed.executions[0].tasks[0].uiContext.screenshot.base64;
      const p2 = parsed.executions[0].tasks[1].uiContext.screenshot.base64;
      expect(p1).toBe(p2);

      const files = readdirSync(screenshotsDir);
      expect(files).toHaveLength(1);
      const content = readFileSync(join(screenshotsDir, files[0]));
      expect(content.length).toBeGreaterThan(0);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('should throw for legacy screenshot formats', () => {
    const tmp = getTmpDir('execution-inline-converter-compat');
    try {
      const screenshotsDir = join(tmp, 'screenshots');
      const json = JSON.stringify({
        executions: [
          {
            tasks: [
              {
                uiContext: {
                  screenshot: { $screenshot: 'legacy-id', capturedAt: 1 },
                },
              },
              {
                uiContext: {
                  screenshot: {
                    base64: './screenshots/already-written.png',
                    capturedAt: 2,
                  },
                },
              },
            ],
          },
        ],
      });

      expect(() =>
        convertExecutionInlineJsonToReportDump({
          serializedExecutionJson: json,
          screenshotsDir,
          hashToRelativePath: new Map<string, string>(),
        }),
      ).toThrow();
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});
