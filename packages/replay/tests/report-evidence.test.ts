import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it } from '@rstest/core';
import { exportReportEvidence } from '../scripts/report-evidence.mjs';

const roots: string[] = [];
afterEach(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});
const directory = () => {
  const dir = mkdtempSync(join(tmpdir(), 'replay-images-'));
  roots.push(dir);
  return dir;
};
it('preserves task order, image phases and failed states while deduplicating image bytes', () => {
  const dir = directory();
  const screenshot = { base64: 'data:image/png;base64,YQ==', capturedAt: 10 };
  const dump = {
    executions: [
      {
        name: '1. Search',
        tasks: [
          {
            taskId: 'a',
            type: 'Action Space',
            subType: 'Tap',
            status: 'failed',
            error: 'navigation failed',
            recorder: [
              { type: 'screenshot', timing: 'before', screenshot },
              { type: 'screenshot', timing: 'after-calling', screenshot },
            ],
          },
          {
            taskId: 'b',
            type: 'Log',
            subType: 'Screenshot',
            status: 'finished',
            param: { content: '{"count":1}' },
            recorder: [{ type: 'screenshot', screenshot }],
          },
        ],
      },
    ],
  };
  const index: {
    taskId: string;
    status: string;
    content?: string;
    images: { path: string; phase: string }[];
  }[] = exportReportEvidence(dump, dir).entries;
  expect(index.map((entry) => [entry.taskId, entry.status])).toEqual([
    ['a', 'failed'],
    ['b', 'finished'],
  ]);
  expect(index[0].images.map((image) => image.phase)).toEqual([
    'before',
    'after-calling',
  ]);
  expect(index[1].images[0].phase).toBe('checkpoint');
  expect(index[1].content).toBe('{"count":1}');
  expect(readdirSync(join(dir, 'images'))).toHaveLength(1);
  expect(readFileSync(join(dir, index[0].images[0].path)).toString()).toBe('a');
});
it('fails evidence export when an expected inline image is missing', () => {
  expect(() =>
    exportReportEvidence(
      {
        executions: [
          { tasks: [{ recorder: [{ type: 'screenshot', screenshot: {} }] }] },
        ],
      },
      directory(),
    ),
  ).toThrow('REPORT_IMAGE_MISSING');
});
