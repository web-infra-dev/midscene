import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { flattenGroupedDumpTasks } from '../store/flatten-tasks';
import { buildTimelineScreenshots } from './build-timeline-screenshots';

const testDataDir = path.resolve(__dirname, '../../../test-data');
const fixtureFiles = fs
  .readdirSync(testDataDir)
  .filter((file) => file.endsWith('.json'));

describe('helpers against real test-data fixtures', () => {
  for (const file of fixtureFiles) {
    it(`processes ${file} without errors`, () => {
      const raw = fs.readFileSync(path.join(testDataDir, file), 'utf-8');
      const dump = JSON.parse(raw);

      const allTasks = flattenGroupedDumpTasks(dump);
      expect(Array.isArray(allTasks)).toBe(true);

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
