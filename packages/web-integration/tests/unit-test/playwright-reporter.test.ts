import path from 'node:path';
import { fileURLToPath } from 'node:url';
import MidsceneReporter from '@/playwright/reporter';
import * as coreUtils from '@midscene/core/utils';
import type {
  FullConfig,
  Suite,
  TestCase,
  TestResult,
} from '@playwright/test/reporter';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const __filename_url = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename_url);
const defaultConfig = {
  projects: [],
  forbidOnly: false,
  fullyParallel: false,
  workers: 1,
  webServer: null,
  globalSetup: null,
  globalTeardown: null,
  globalTimeout: 0,
  grep: [],
  grepInvert: null,
  maxFailures: 0,
  metadata: {},
  preserveOutput: 'always',
  quiet: false,
  reportSlowTests: null,
  shard: null,
  updateSnapshots: 'all',
  version: '',
};

// Mock core utilities to prevent actual file I/O
vi.mock('@midscene/core/utils', () => ({
  writeDumpReport: vi.fn(),
}));

// Resolve path to the actual reporter file from the test file's location
const reporterPath = path.resolve(
  __dirname,
  '../../src/playwright/reporter/index.ts',
);
const reporterPackageName = '@midscene/web/playwright-reporter';

describe('MidsceneReporter', () => {
  const mockSuite = {} as Suite;

  beforeEach(() => {
    // Reset mocks before each test
    vi.clearAllMocks();
  });

  afterEach(() => {
    // Restore any global mocks
    vi.unstubAllGlobals();
  });

  describe('onBegin', () => {
    it('should set mode to "separate" from config when reporter is specified by file path', async () => {
      vi.stubGlobal('__filename', reporterPath);
      const reporter = new MidsceneReporter();
      const mockConfig: FullConfig = {
        ...defaultConfig,
        rootDir: '/path/to/project',
        reporter: [['list'], [reporterPath, { type: 'separate' }]],
      } as FullConfig;

      await reporter.onBegin(mockConfig, mockSuite);
      expect(reporter.mode).toBe('separate');
    });

    it('should set mode to "separate" from config when reporter is specified by package name', async () => {
      const reporter = new MidsceneReporter();
      const mockConfig: FullConfig = {
        ...defaultConfig,
        rootDir: '/path/to/project',
        reporter: [['list'], [reporterPackageName, { type: 'separate' }]],
      } as FullConfig;

      await reporter.onBegin(mockConfig, mockSuite);
      expect(reporter.mode).toBe('separate');
    });

    it('should have an undefined mode if its config is not found', async () => {
      const reporter = new MidsceneReporter();
      const mockConfig: FullConfig = {
        ...defaultConfig,
        rootDir: '/path/to/project',
        reporter: [['list'], ['html']],
      } as FullConfig;

      await reporter.onBegin(mockConfig, mockSuite);
      expect(reporter.mode).toBeUndefined();
    });

    it('should have an undefined mode if options object is missing', async () => {
      vi.stubGlobal('__filename', reporterPath);
      const reporter = new MidsceneReporter();
      const mockConfig: FullConfig = {
        ...defaultConfig,
        rootDir: '/path/to/project',
        reporter: [['list'], [reporterPath]],
      } as FullConfig;

      await reporter.onBegin(mockConfig, mockSuite);
      expect(reporter.mode).toBeUndefined();
    });

    it('should have an undefined mode if type property is missing from options', async () => {
      vi.stubGlobal('__filename', reporterPath);
      const reporter = new MidsceneReporter();
      const mockConfig: FullConfig = {
        ...defaultConfig,
        rootDir: '/path/to/project',
        reporter: [['list'], [reporterPath, { otherOption: 'value' }]],
      } as FullConfig;

      await reporter.onBegin(mockConfig, mockSuite);
      expect(reporter.mode).toBeUndefined();
    });

    it('should handle an empty reporter array gracefully', async () => {
      const reporter = new MidsceneReporter();
      const mockConfig: FullConfig = {
        ...defaultConfig,
        rootDir: '/path/to/project',
        reporter: [],
      } as FullConfig;

      await reporter.onBegin(mockConfig, mockSuite);
      expect(reporter.mode).toBeUndefined();
    });

    it('should handle a missing reporter array gracefully', async () => {
      const reporter = new MidsceneReporter();
      const mockConfig: FullConfig = {
        ...defaultConfig,
        reporter: [],
        rootDir: '/path/to/project',
      } as FullConfig;

      await reporter.onBegin(mockConfig, mockSuite);
      expect(reporter.mode).toBeUndefined();
    });
  });

  describe('onTestEnd', () => {
    it('should not write a report if mode is not set', () => {
      const reporter = new MidsceneReporter(); // mode is undefined
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
      const reporter = new MidsceneReporter();
      // Manually set mode as onBegin would
      await reporter.onBegin(
        {
          rootDir: '/path/to/project',
          reporter: [[reporterPackageName, { type: 'merged' }]],
        } as unknown as FullConfig,
        mockSuite,
      );

      const mockTest: TestCase = {
        id: 'test-id-1',
        title: 'My Test Case',
        annotations: [
          { type: 'some-other-annotation', description: 'some-data' },
          { type: 'MIDSCENE_DUMP_ANNOTATION', description: 'dump-data-string' },
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
          dumpString: 'dump-data-string',
          attributes: {
            playwright_test_id: 'test-id-1',
            playwright_test_title: 'My Test Case',
            playwright_test_status: 'passed',
            playwright_test_duration: 123,
          },
        },
        true, // merged mode
      );
    });

    it('should remove the dump annotation after processing', async () => {
      const reporter = new MidsceneReporter();
      await reporter.onBegin(
        {
          rootDir: '/path/to/project',
          reporter: [[reporterPackageName, { type: 'merged' }]],
        } as unknown as FullConfig,
        mockSuite,
      );

      const mockTest: TestCase = {
        id: 'test-id-2',
        title: 'Another Test',
        annotations: [
          { type: 'MIDSCENE_DUMP_ANNOTATION', description: 'dump-data' },
        ],
      } as any;
      const mockResult: TestResult = { status: 'failed' } as any;

      reporter.onTestEnd(mockTest, mockResult);

      expect(mockTest.annotations).toEqual([]);
    });

    it('should not write a report if dump annotation is not present', async () => {
      const reporter = new MidsceneReporter();
      await reporter.onBegin(
        {
          rootDir: '/path/to/project',
          reporter: [[reporterPackageName, { type: 'merged' }]],
        } as unknown as FullConfig,
        mockSuite,
      );

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
      const reporter = new MidsceneReporter();
      await reporter.onBegin(
        {
          rootDir: '/path/to/project',
          reporter: [[reporterPackageName, { type: 'merged' }]],
        } as unknown as FullConfig,
        mockSuite,
      );

      const mockTest: TestCase = {
        id: 'test-id-4',
        title: 'A Flaky Test',
        annotations: [
          { type: 'MIDSCENE_DUMP_ANNOTATION', description: 'flaky-data' },
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
  });
});
