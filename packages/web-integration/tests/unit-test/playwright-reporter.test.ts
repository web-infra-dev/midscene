import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import MidsceneReporter from '@/playwright/reporter';
import * as coreUtils from '@midscene/core/utils';
import type { TestCase, TestResult } from '@playwright/test/reporter';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);

// Mock core utilities to prevent actual file I/O
vi.mock('@midscene/core/utils', () => ({
  writeDumpReport: vi.fn(),
}));

describe('MidsceneReporter', () => {
  let originalResolve: typeof require.resolve;
  let tempDir: string;

  beforeEach(() => {
    // Reset mocks before each test
    vi.clearAllMocks();
    // Backup original require.resolve
    originalResolve = require.resolve;
    // Create temp directory for test files
    tempDir = mkdtempSync(join(tmpdir(), 'midscene-test-'));
  });

  afterEach(() => {
    // Restore any global mocks
    vi.unstubAllGlobals();
    // Restore original require.resolve
    require.resolve = originalResolve;
    // Clean up temp directory
    if (tempDir && existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('constructor', () => {
    it('should set mode to separate when type option is provided', () => {
      const reporter = new MidsceneReporter({ type: 'separate' });
      expect(reporter.mode).toBe('separate');
    });

    it('should set mode to merged when type option is provided', () => {
      const reporter = new MidsceneReporter({ type: 'merged' });
      expect(reporter.mode).toBe('merged');
    });

    it('should default to merged mode when no options are provided', () => {
      const reporter = new MidsceneReporter();
      expect(reporter.mode).toBe('merged');
    });

    it('should default to merged mode when options object is empty', () => {
      const reporter = new MidsceneReporter({});
      expect(reporter.mode).toBe('merged');
    });

    it('should default to merged mode when type is undefined', () => {
      const reporter = new MidsceneReporter({ type: undefined });
      expect(reporter.mode).toBe('merged');
    });

    it('should throw error for invalid type', () => {
      expect(() => {
        new MidsceneReporter({ type: 'invalid' as any });
      }).toThrow(
        "Unknown reporter type in playwright config: invalid, only support 'merged' or 'separate'",
      );
    });
  });

  describe('onTestEnd', () => {
    it('should not write a report if mode is not set', () => {
      const reporter = new MidsceneReporter();
      // Manually clear mode to simulate the old behavior where mode could be undefined
      reporter.mode = undefined;

      const mockTest: TestCase = {
        id: 'test-id-0',
        title: 'Should Not Report',
        annotations: [
          {
            type: 'MIDSCENE_DUMP_ANNOTATION',
            description: 'should-not-be-written',
          },
        ],
      } as any;
      const mockResult: TestResult = { status: 'passed' } as any;

      reporter.onTestEnd(mockTest, mockResult);
      expect(coreUtils.writeDumpReport).not.toHaveBeenCalled();
    });

    it('should write a report if dump annotation is present and mode is set', async () => {
      const reporter = new MidsceneReporter({ type: 'merged' });

      // Create a temp file with dump content
      const tempFile = join(tempDir, 'test-dump.json');
      const dumpContent = 'dump-data-string';
      writeFileSync(tempFile, dumpContent, 'utf-8');

      const mockTest: TestCase = {
        id: 'test-id-1',
        title: 'My Test Case',
        annotations: [
          { type: 'some-other-annotation', description: 'some-data' },
          { type: 'MIDSCENE_DUMP_ANNOTATION', description: tempFile },
        ],
      } as any;
      const mockResult: TestResult = {
        status: 'passed',
        duration: 123,
      } as any;

      reporter.onTestEnd(mockTest, mockResult);

      expect(coreUtils.writeDumpReport).toHaveBeenCalledTimes(1);
      expect(coreUtils.writeDumpReport).toHaveBeenCalledWith(
        expect.stringContaining('playwright-merged'),
        {
          dumpString: dumpContent,
          attributes: {
            playwright_test_id: 'test-id-1',
            playwright_test_title: 'My Test Case',
            playwright_test_status: 'passed',
            playwright_test_duration: 123,
          },
        },
        true, // merged mode
      );

      // Verify temp file was deleted
      expect(existsSync(tempFile)).toBe(false);
    });

    it('should clear the dump annotation description after processing', async () => {
      const reporter = new MidsceneReporter({ type: 'merged' });

      const mockTest: TestCase = {
        id: 'test-id-2',
        title: 'Another Test',
        annotations: [
          { type: 'MIDSCENE_DUMP_ANNOTATION', description: 'dump-data' },
        ],
      } as any;
      const mockResult: TestResult = { status: 'failed' } as any;

      reporter.onTestEnd(mockTest, mockResult);

      // The annotation should still exist but with empty description
      expect(mockTest.annotations).toHaveLength(1);
      expect(mockTest.annotations[0].type).toBe('MIDSCENE_DUMP_ANNOTATION');
      expect(mockTest.annotations[0].description).toBe('');
    });

    it('should not write a report if dump annotation is not present', async () => {
      const reporter = new MidsceneReporter({ type: 'merged' });

      const mockTest: TestCase = {
        id: 'test-id-3',
        title: 'No Dump Test',
        annotations: [{ type: 'some-other-annotation' }],
      } as any;
      const mockResult: TestResult = { status: 'passed' } as any;

      reporter.onTestEnd(mockTest, mockResult);

      expect(coreUtils.writeDumpReport).not.toHaveBeenCalled();
    });

    it('should handle retry attempts in test title and id', async () => {
      const reporter = new MidsceneReporter({ type: 'merged' });

      // Create a temp file
      const tempFile = join(tempDir, 'flaky-dump.json');
      writeFileSync(tempFile, 'flaky-data', 'utf-8');

      const mockTest: TestCase = {
        id: 'test-id-4',
        title: 'A Flaky Test',
        annotations: [
          { type: 'MIDSCENE_DUMP_ANNOTATION', description: tempFile },
        ],
      } as any;
      const mockResult: TestResult = {
        status: 'passed',
        duration: 456,
        retry: 1,
      } as any;

      reporter.onTestEnd(mockTest, mockResult);

      expect(coreUtils.writeDumpReport).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          attributes: expect.objectContaining({
            playwright_test_id: 'test-id-4(retry #1)',
            playwright_test_title: 'A Flaky Test(retry #1)',
          }),
        }),
        true,
      );
    });

    it('should clear memory after each write to reduce memory usage', async () => {
      const reporter = new MidsceneReporter({ type: 'merged' });

      // Create a large dump string to simulate memory usage
      const largeDumpData = 'x'.repeat(10 * 1024 * 1024); // 10MB string
      const tempFile = join(tempDir, 'large-dump.json');
      writeFileSync(tempFile, largeDumpData, 'utf-8');

      const mockTest: TestCase = {
        id: 'test-id-memory',
        title: 'Memory Test',
        annotations: [
          { type: 'MIDSCENE_DUMP_ANNOTATION', description: tempFile },
        ],
      } as any;
      const mockResult: TestResult = { status: 'passed', duration: 100 } as any;

      // Store reference to the annotation
      const annotation = mockTest.annotations[0];

      // Before onTestEnd, the annotation should contain only the file path
      expect(annotation.description).toBe(tempFile);
      expect(annotation.description?.length).toBeLessThan(200); // Path is much smaller than 10MB

      // Process the test
      reporter.onTestEnd(mockTest, mockResult);

      // After onTestEnd, the annotation should be cleared
      expect(annotation.description).toBe('');
      expect(annotation.description?.length).toBe(0);

      // Verify the report was written with the original data
      expect(coreUtils.writeDumpReport).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          dumpString: largeDumpData,
        }),
        true,
      );

      // Verify temp file was deleted
      expect(existsSync(tempFile)).toBe(false);
    });

    it('should not write report again if annotation is already cleared', async () => {
      const reporter = new MidsceneReporter({ type: 'merged' });

      const mockTest: TestCase = {
        id: 'test-id-cleared',
        title: 'Cleared Test',
        annotations: [
          { type: 'MIDSCENE_DUMP_ANNOTATION', description: '' }, // Already cleared
        ],
      } as any;
      const mockResult: TestResult = { status: 'passed' } as any;

      reporter.onTestEnd(mockTest, mockResult);

      // Should not write report for empty description
      expect(coreUtils.writeDumpReport).not.toHaveBeenCalled();
    });

    it('should handle multiple dump updates and clears correctly', async () => {
      const reporter = new MidsceneReporter({ type: 'merged' });

      const mockTest: TestCase = {
        id: 'test-id-multiple',
        title: 'Multiple Updates Test',
        annotations: [],
      } as any;
      const mockResult: TestResult = { status: 'passed', duration: 200 } as any;

      // First dump update - simulate agent writing dump to temp file
      const firstDump = 'first-dump-data-5mb'.repeat(250000); // ~5MB
      const firstTempFile = join(tempDir, 'first-dump.json');
      writeFileSync(firstTempFile, firstDump, 'utf-8');
      mockTest.annotations.push({
        type: 'MIDSCENE_DUMP_ANNOTATION',
        description: firstTempFile,
      });

      // First write
      reporter.onTestEnd(mockTest, mockResult);

      // Verify first write
      expect(coreUtils.writeDumpReport).toHaveBeenCalledTimes(1);
      expect(coreUtils.writeDumpReport).toHaveBeenLastCalledWith(
        expect.any(String),
        expect.objectContaining({
          dumpString: expect.stringContaining('first-dump-data'),
        }),
        true,
      );

      // Verify annotation was cleared and temp file deleted
      expect(mockTest.annotations[0].description).toBe('');
      expect(existsSync(firstTempFile)).toBe(false);

      // Second dump update - simulate more agent actions
      const secondDump = 'second-dump-data-10mb'.repeat(500000); // ~10MB
      const secondTempFile = join(tempDir, 'second-dump.json');
      writeFileSync(secondTempFile, secondDump, 'utf-8');
      mockTest.annotations[0].description = secondTempFile;

      // Second write
      reporter.onTestEnd(mockTest, mockResult);

      // Verify second write
      expect(coreUtils.writeDumpReport).toHaveBeenCalledTimes(2);
      expect(coreUtils.writeDumpReport).toHaveBeenLastCalledWith(
        expect.any(String),
        expect.objectContaining({
          dumpString: expect.stringContaining('second-dump-data'),
        }),
        true,
      );

      // Verify annotation was cleared again and temp file deleted
      expect(mockTest.annotations[0].description).toBe('');
      expect(existsSync(secondTempFile)).toBe(false);

      // Third attempt with empty description - should not write
      reporter.onTestEnd(mockTest, mockResult);

      // Should still be 2 calls, not 3
      expect(coreUtils.writeDumpReport).toHaveBeenCalledTimes(2);

      // Fourth dump update - simulate final agent actions
      const thirdDump = 'third-dump-data-15mb'.repeat(750000); // ~15MB
      const thirdTempFile = join(tempDir, 'third-dump.json');
      writeFileSync(thirdTempFile, thirdDump, 'utf-8');
      mockTest.annotations[0].description = thirdTempFile;

      // Fourth write
      reporter.onTestEnd(mockTest, mockResult);

      // Verify third write
      expect(coreUtils.writeDumpReport).toHaveBeenCalledTimes(3);
      expect(coreUtils.writeDumpReport).toHaveBeenLastCalledWith(
        expect.any(String),
        expect.objectContaining({
          dumpString: expect.stringContaining('third-dump-data'),
        }),
        true,
      );

      // Verify annotation was cleared and temp file deleted
      expect(mockTest.annotations[0].description).toBe('');
      expect(existsSync(thirdTempFile)).toBe(false);

      // Verify annotation structure is preserved throughout
      expect(mockTest.annotations).toHaveLength(1);
      expect(mockTest.annotations[0].type).toBe('MIDSCENE_DUMP_ANNOTATION');
    });

    it('should handle concurrent annotations correctly', async () => {
      const reporter = new MidsceneReporter({ type: 'merged' });

      // Create temp file for dump
      const tempFile = join(tempDir, 'concurrent-dump.json');
      writeFileSync(tempFile, 'dump-to-clear', 'utf-8');

      const mockTest: TestCase = {
        id: 'test-id-concurrent',
        title: 'Concurrent Annotations Test',
        annotations: [
          { type: 'OTHER_ANNOTATION', description: 'should-remain' },
          { type: 'MIDSCENE_DUMP_ANNOTATION', description: tempFile },
          { type: 'ANOTHER_ANNOTATION', description: 'also-should-remain' },
        ],
      } as any;
      const mockResult: TestResult = { status: 'passed' } as any;

      reporter.onTestEnd(mockTest, mockResult);

      // Verify dump was written
      expect(coreUtils.writeDumpReport).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          dumpString: 'dump-to-clear',
        }),
        true,
      );

      // Verify only MIDSCENE_DUMP_ANNOTATION was cleared
      expect(mockTest.annotations).toHaveLength(3);
      expect(mockTest.annotations[0].description).toBe('should-remain');
      expect(mockTest.annotations[1].description).toBe(''); // Only this one cleared
      expect(mockTest.annotations[2].description).toBe('also-should-remain');

      // Verify temp file was deleted
      expect(existsSync(tempFile)).toBe(false);
    });

    it('should handle missing temp file gracefully', async () => {
      const reporter = new MidsceneReporter({ type: 'merged' });
      const consoleSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});

      // Use non-existent file path
      const mockTest: TestCase = {
        id: 'test-id-missing',
        title: 'Missing File Test',
        annotations: [
          {
            type: 'MIDSCENE_DUMP_ANNOTATION',
            description: '/tmp/non-existent-file.json',
          },
        ],
      } as any;
      const mockResult: TestResult = { status: 'passed' } as any;

      reporter.onTestEnd(mockTest, mockResult);

      // Verify no report was written
      expect(coreUtils.writeDumpReport).not.toHaveBeenCalled();

      // Verify error was logged
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to read dump file'),
        expect.anything(),
      );

      consoleSpy.mockRestore();
    });
  });
});
