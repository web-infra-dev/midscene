import fs from 'node:fs';
import path from 'node:path';
import type { GroupedActionDump } from '@midscene/core';
import { describe, expect, it } from 'vitest';
import { flattenGroupedDumpTasks } from '../store/flatten-tasks';
import { buildTimelineScreenshots } from './build-timeline-screenshots';

const testDataDir = path.resolve(__dirname, '../../../test-data');
const fixtureFiles = fs
  .readdirSync(testDataDir)
  .filter((file) => file.endsWith('.json'));

function collectScreenshotRefIds(value: unknown, ids: string[]): void {
  if (Array.isArray(value)) {
    for (const item of value) collectScreenshotRefIds(item, ids);
    return;
  }

  if (typeof value !== 'object' || value === null) return;
  const record = value as Record<string, unknown>;
  if (
    record.type === 'midscene_screenshot_ref' &&
    typeof record.id === 'string'
  ) {
    ids.push(record.id);
    return;
  }

  for (const item of Object.values(record)) {
    collectScreenshotRefIds(item, ids);
  }
}

describe('helpers against real test-data fixtures', () => {
  for (const file of fixtureFiles) {
    it(`processes ${file} without errors`, () => {
      const raw = fs.readFileSync(path.join(testDataDir, file), 'utf-8');
      const fixture = JSON.parse(raw) as {
        dump: GroupedActionDump;
        images: Record<string, string>;
      };
      const dump = fixture.dump;
      const screenshotRefIds: string[] = [];
      collectScreenshotRefIds(dump, screenshotRefIds);

      expect(JSON.stringify(dump)).not.toContain('data:image/');
      for (const id of screenshotRefIds) {
        expect(fixture.images[id]).toMatch(/^data:image\/(jpeg|png);base64,/);
      }

      const allTasks = flattenGroupedDumpTasks(dump);
      expect(Array.isArray(allTasks)).toBe(true);
      expect(allTasks.every((task) => Boolean(task.taskId))).toBe(true);

      const result = buildTimelineScreenshots(allTasks);
      expect(Array.isArray(result.allScreenshots)).toBe(true);
      expect(result.idTaskMap).toBeTypeOf('object');
      expect(typeof result.startingTime).toBe('number');

      // Every emitted id must reverse-map to a real task
      for (const shot of result.allScreenshots) {
        expect(result.idTaskMap[shot.id]).toBeDefined();
      }

      // No NaN offsets — would imply startingTime mismatch
      for (const shot of result.allScreenshots) {
        expect(Number.isFinite(shot.timeOffset)).toBe(true);
      }
    });
  }
});
