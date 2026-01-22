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

    it('should handle file path and delete temp file after processing', async () => {
      const reporter = new MidsceneReporter({ type: 'merged' });

      // Create temp file
      const tempFile = join(tempDir, 'test-dump-2.json');
      writeFileSync(tempFile, 'dump-data', 'utf-8');

      const mockTest: TestCase = {
        id: 'test-id-2',
        title: 'Another Test',
        annotations: [
          { type: 'MIDSCENE_DUMP_ANNOTATION', description: tempFile },
        ],
      } as any;
      const mockResult: TestResult = { status: 'failed' } as any;

      reporter.onTestEnd(mockTest, mockResult);

      // The annotation should still exist with the path (no clearing)
      expect(mockTest.annotations).toHaveLength(1);
      expect(mockTest.annotations[0].type).toBe('MIDSCENE_DUMP_ANNOTATION');
      expect(mockTest.annotations[0].description).toBe(tempFile);

      // Temp file should be deleted
      expect(existsSync(tempFile)).toBe(false);
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

    it('should include project name in test title when available', async () => {
      const reporter = new MidsceneReporter({ type: 'merged' });

      // Simulate multi-project configuration to enable browser labels
      const mockConfig = {
        projects: [{ name: 'chromium' }, { name: 'webkit' }],
      } as any;
      const mockSuite = {} as any;
      await reporter.onBegin(mockConfig, mockSuite);

      // Create a temp file
      const tempFile = join(tempDir, 'browser-test-dump.json');
      writeFileSync(tempFile, 'browser-test-data', 'utf-8');

      // Mock test with parent suite that has a project
      const mockProject = { name: 'chromium' };
      const mockParent = {
        project: () => mockProject,
      };

      const mockTest: TestCase = {
        id: 'test-id-5',
        title: 'Browser Compatibility Test',
        parent: mockParent,
        annotations: [
          { type: 'MIDSCENE_DUMP_ANNOTATION', description: tempFile },
        ],
      } as any;
      const mockResult: TestResult = {
        status: 'passed',
        duration: 789,
      } as any;

      reporter.onTestEnd(mockTest, mockResult);

      expect(coreUtils.writeDumpReport).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          attributes: expect.objectContaining({
            playwright_test_id: 'test-id-5',
            playwright_test_title: 'Browser Compatibility Test [chromium]',
          }),
        }),
        true,
      );
    });

    it('should include both project name and retry in test title', async () => {
      const reporter = new MidsceneReporter({ type: 'merged' });

      // Simulate multi-project configuration to enable browser labels
      const mockConfig = {
        projects: [{ name: 'chromium' }, { name: 'webkit' }],
      } as any;
      const mockSuite = {} as any;
      await reporter.onBegin(mockConfig, mockSuite);

      // Create a temp file
      const tempFile = join(tempDir, 'retry-browser-dump.json');
      writeFileSync(tempFile, 'retry-browser-data', 'utf-8');

      // Mock test with parent suite that has a project
      const mockProject = { name: 'webkit' };
      const mockParent = {
        project: () => mockProject,
      };

      const mockTest: TestCase = {
        id: 'test-id-6',
        title: 'Flaky Browser Test',
        parent: mockParent,
        annotations: [
          { type: 'MIDSCENE_DUMP_ANNOTATION', description: tempFile },
        ],
      } as any;
      const mockResult: TestResult = {
        status: 'passed',
        duration: 999,
        retry: 2,
      } as any;

      reporter.onTestEnd(mockTest, mockResult);

      expect(coreUtils.writeDumpReport).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          attributes: expect.objectContaining({
            playwright_test_id: 'test-id-6(retry #2)',
            playwright_test_title: 'Flaky Browser Test [webkit](retry #2)',
          }),
        }),
        true,
      );
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
        expect.stringContaining('Failed to read Midscene dump file'),
        expect.anything(),
      );

      consoleSpy.mockRestore();
    });

    it('should not add project suffix when only one project exists', async () => {
      const reporter = new MidsceneReporter({ type: 'merged' });

      // Simulate single project configuration
      const mockConfig = {
        projects: [{ name: 'chromium' }],
      } as any;
      const mockSuite = {} as any;
      await reporter.onBegin(mockConfig, mockSuite);

      // Create a temp file
      const tempFile = join(tempDir, 'single-project-dump.json');
      writeFileSync(tempFile, 'single-project-data', 'utf-8');

      const mockTest: TestCase = {
        id: 'test-id-5',
        title: 'Single Project Test',
        parent: {
          project: () => ({ name: 'chromium' }),
        },
        annotations: [
          { type: 'MIDSCENE_DUMP_ANNOTATION', description: tempFile },
        ],
      } as any;
      const mockResult: TestResult = {
        status: 'passed',
        duration: 100,
      } as any;

      reporter.onTestEnd(mockTest, mockResult);

      expect(coreUtils.writeDumpReport).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          attributes: expect.objectContaining({
            playwright_test_title: 'Single Project Test',
          }),
        }),
        true,
      );
    });

    it('should add project suffix when multiple projects exist', async () => {
      const reporter = new MidsceneReporter({ type: 'merged' });

      // Simulate multi-project configuration
      const mockConfig = {
        projects: [{ name: 'chromium' }, { name: 'webkit' }],
      } as any;
      const mockSuite = {} as any;
      await reporter.onBegin(mockConfig, mockSuite);

      // Create a temp file
      const tempFile = join(tempDir, 'multi-project-dump.json');
      writeFileSync(tempFile, 'multi-project-data', 'utf-8');

      const mockTest: TestCase = {
        id: 'test-id-6',
        title: 'Multi Project Test',
        parent: {
          project: () => ({ name: 'webkit' }),
        },
        annotations: [
          { type: 'MIDSCENE_DUMP_ANNOTATION', description: tempFile },
        ],
      } as any;
      const mockResult: TestResult = {
        status: 'passed',
        duration: 150,
      } as any;

      reporter.onTestEnd(mockTest, mockResult);

      expect(coreUtils.writeDumpReport).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          attributes: expect.objectContaining({
            playwright_test_title: 'Multi Project Test [webkit]',
          }),
        }),
        true,
      );
    });

    it('should handle project suffix with retry in multi-project setup', async () => {
      const reporter = new MidsceneReporter({ type: 'merged' });

      // Simulate multi-project configuration
      const mockConfig = {
        projects: [{ name: 'chromium' }, { name: 'webkit' }],
      } as any;
      const mockSuite = {} as any;
      await reporter.onBegin(mockConfig, mockSuite);

      // Create a temp file
      const tempFile = join(tempDir, 'retry-multi-project-dump.json');
      writeFileSync(tempFile, 'retry-multi-project-data', 'utf-8');

      const mockTest: TestCase = {
        id: 'test-id-7',
        title: 'Retry Multi Project Test',
        parent: {
          project: () => ({ name: 'chromium' }),
        },
        annotations: [
          { type: 'MIDSCENE_DUMP_ANNOTATION', description: tempFile },
        ],
      } as any;
      const mockResult: TestResult = {
        status: 'passed',
        duration: 200,
        retry: 2,
      } as any;

      reporter.onTestEnd(mockTest, mockResult);

      expect(coreUtils.writeDumpReport).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          attributes: expect.objectContaining({
            playwright_test_title:
              'Retry Multi Project Test [chromium](retry #2)',
          }),
        }),
        true,
      );
    });
  });
});
