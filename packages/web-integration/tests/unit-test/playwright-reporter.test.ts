import { createRequire } from 'node:module';
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
import {
  type Mock,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

const require = createRequire(import.meta.url);

const __filename_url = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename_url);

// Mock core utilities to prevent actual file I/O
vi.mock('@midscene/core/utils', () => ({
  writeDumpReport: vi.fn(),
}));

// Resolve path to the actual reporter file from the test file's location
const reporterSrcPath = path.resolve(
  __dirname,
  '../../src/playwright/reporter/index.ts',
);
const reporterPackageName = '@midscene/web/playwright-reporter';

describe('MidsceneReporter', () => {
  const mockSuite = {} as Suite;
  let originalResolve: typeof require.resolve;

  beforeEach(() => {
    // Reset mocks before each test
    vi.clearAllMocks();
    // Backup original require.resolve
    originalResolve = require.resolve;
  });

  afterEach(() => {
    // Restore any global mocks
    vi.unstubAllGlobals();
    // Restore original require.resolve
    require.resolve = originalResolve;
  });

  describe('onBegin', () => {
    it('should set mode from config when reporter is specified by file path', async () => {
      vi.stubGlobal('__filename', reporterSrcPath);
      const reporter = new MidsceneReporter();
      const mockConfig: FullConfig = {
        rootDir: '/path/to/project',
        reporter: [['list'], [reporterSrcPath, { type: 'separate' }]],
      } as any;

      await reporter.onBegin(mockConfig, mockSuite);
      expect(reporter.mode).toBe('separate');
    });

    it('should set mode from config when reporter is specified by package name', async () => {
      // Use the same dist path resolution as the third test
      const distPath = path.resolve(
        __dirname,
        '../../dist/lib/playwright-reporter.js',
      );

      const reporter = new MidsceneReporter();
      const mockConfig: FullConfig = {
        rootDir: '/path/to/project',
        reporter: [['list'], [distPath, { type: 'separate' }]],
      } as any;

      await reporter.onBegin(mockConfig, mockSuite);
      // This test verifies that when the config contains the resolved dist path,
      // the reporter correctly identifies its configuration via selfResolvedPath match
      expect(reporter.mode).toBe('separate');
    });

    it('should find config when Playwright resolves package name to dist path', async () => {
      // This simulates the real-world scenario where Playwright resolves the package name
      // to the compiled 'dist' file path, but the test is running the 'src' file.
      const distPath = path.resolve(
        __dirname,
        '../../dist/lib/playwright-reporter.js',
      );

      // Mock require.resolve to return the 'dist' path
      require.resolve = vi.fn((pkg) => {
        if (pkg === reporterPackageName) {
          return distPath;
        }
        return originalResolve(pkg);
      }) as any;

      // __filename will point to the 'src' file path during the test run
      vi.stubGlobal('__filename', reporterSrcPath);

      const reporter = new MidsceneReporter();
      const mockConfig: FullConfig = {
        rootDir: '/path/to/project',
        // In the config, Playwright has already resolved the package name to the dist path
        reporter: [['list'], [distPath, { type: 'separate' }]],
      } as any;

      await reporter.onBegin(mockConfig, mockSuite);
      expect(reporter.mode).toBe('separate');
    });

    it('should have an undefined mode if its config is not found', async () => {
      const reporter = new MidsceneReporter();
      const mockConfig: FullConfig = {
        rootDir: '/path/to/project',
        reporter: [['list'], ['html']],
      } as any;

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
      reporter.mode = 'merged'; // Manually set mode

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
          reporter: [[reporterSrcPath, { type: 'merged' }]],
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
          reporter: [[reporterSrcPath, { type: 'merged' }]],
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
          reporter: [[reporterSrcPath, { type: 'merged' }]],
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
