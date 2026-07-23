import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ReportActionDump } from '../../src/dump/report-action-dump';
import { ScreenshotItem } from '../../src/screenshot-item';
import { ExecutionDump } from '../../src/types';

const webpBody =
  'UklGRjQAAABXRUJQVlA4ICgAAACQAQCdASoCAAMAAMASJQBOl0AAjNAA/v4icv1difCfoP7mxzi2QwAA';
const webpBase64 = `data:image/webp;base64,${webpBody}`;

describe('ReportActionDump WebP file serialization', () => {
  let temporaryDirectory: string;

  beforeEach(() => {
    temporaryDirectory = join(
      tmpdir(),
      `midscene-dump-webp-${Date.now()}-${Math.random()}`,
    );
    mkdirSync(temporaryDirectory, { recursive: true });
  });

  afterEach(() => {
    rmSync(temporaryDirectory, { recursive: true, force: true });
  });

  it('writes and restores WebP files without changing their bytes or MIME type', () => {
    const screenshot = ScreenshotItem.create(webpBase64, 100);
    const dump = new ReportActionDump({
      sdkVersion: '1.0.0-test',
      groupName: 'webp-dump',
      modelBriefs: [],
      executions: [
        new ExecutionDump({
          logTime: 100,
          name: 'webp-execution',
          tasks: [
            {
              taskId: 'webp-task',
              type: 'Insight',
              subType: 'Locate',
              param: { prompt: 'target' },
              uiContext: {
                screenshot,
                shotSize: { width: 2, height: 3 },
                shrunkShotToLogicalRatio: 1,
              },
              executor: async () => undefined,
              recorder: [],
              status: 'finished',
            },
          ],
        }),
      ],
    });
    const dumpPath = join(temporaryDirectory, 'dump.json');

    dump.serializeToFiles(dumpPath);

    const screenshotPath = join(
      `${dumpPath}.screenshots`,
      `${screenshot.id}.webp`,
    );
    expect(existsSync(screenshotPath)).toBe(true);
    expect(readFileSync(screenshotPath).toString('base64')).toBe(webpBody);

    const restored = JSON.parse(
      ReportActionDump.fromFilesAsInlineJson(dumpPath),
    );
    expect(restored.executions[0].tasks[0].uiContext.screenshot).toMatchObject({
      base64: webpBase64,
      capturedAt: 100,
    });
  });
});
