import { existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PlaywrightAiFixture } from '@/playwright/ai-fixture';
import type { TestInfo } from '@playwright/test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock modules that are not relevant to cleanup testing
vi.mock('@midscene/shared/env', async (importOriginal) => {
  const actual = (await importOriginal()) as any;
  return {
    ...actual,
    MIDSCENE_CACHE: 'MIDSCENE_CACHE',
    globalConfigManager: {
      getEnvConfigInBoolean: vi.fn().mockReturnValue(false),
      getEnvConfigValue: vi.fn().mockReturnValue(undefined),
    },
    globalModelConfigManager: {
      getModelConfig: vi.fn(),
    },
  };
});

describe('PlaywrightAiFixture Temp File Cleanup', () => {
  let mockPage: any;
  let mockTestInfo: TestInfo;
  let pageCloseHandler: (() => void) | null = null;
  let createdTempFiles: string[] = [];

  beforeEach(() => {
    vi.clearAllMocks();
    pageCloseHandler = null;
    createdTempFiles = [];

    // Mock Playwright page object
    mockPage = {
      on: vi.fn((event: string, handler: any) => {
        if (event === 'close') {
          pageCloseHandler = handler;
        }
      }),
      context: vi.fn().mockReturnValue({
        pages: vi.fn().mockReturnValue([mockPage]),
      }),
      goto: vi.fn(),
      waitForLoadState: vi.fn(),
      evaluate: vi.fn(),
    };

    // Mock TestInfo object
    mockTestInfo = {
      testId: 'test-cleanup-123',
      titlePath: ['Test Suite', 'Test Case'],
      retry: 0,
      annotations: [],
    } as any;
  });

  afterEach(() => {
    // Clean up any temp files that were created during tests
    for (const filePath of createdTempFiles) {
      try {
        if (existsSync(filePath)) {
          const fs = require('node:fs');
          fs.rmSync(filePath, { force: true });
        }
      } catch (error) {
        // Ignore cleanup errors
      }
    }
    createdTempFiles = [];
  });

  it('should create temp file when dump is updated', async () => {
    const fixture = PlaywrightAiFixture();

    // Create agent for page
    const agentForPageFn = fixture.agentForPage as any;
    const createAgentPromise = agentForPageFn(
      { page: mockPage },
      async (fn: any) => fn(),
      mockTestInfo,
    );

    // Get the agent
    const agent = await createAgentPromise;
    expect(agent).toBeDefined();

    // Trigger dump update by calling onDumpUpdate
    const dumpData = JSON.stringify({
      sdkVersion: '1.0.0',
      groupName: 'test',
      executions: [],
    });

    // Access the internal onDumpUpdate callback
    if (agent.onDumpUpdate) {
      agent.onDumpUpdate(dumpData);
    }

    // Verify temp file was created
    const annotation = mockTestInfo.annotations.find(
      (a) => a.type === 'MIDSCENE_DUMP_ANNOTATION',
    );
    expect(annotation).toBeDefined();
    expect(annotation?.description).toBeDefined();

    const tempFilePath = annotation?.description as string;
    expect(tempFilePath).toContain(tmpdir());
    expect(tempFilePath).toContain('midscene-dump-');
    expect(existsSync(tempFilePath)).toBe(true);

    // Track for cleanup
    createdTempFiles.push(tempFilePath);

    // Verify file content
    const fileContent = readFileSync(tempFilePath, 'utf-8');
    expect(fileContent).toBe(dumpData);
  });

  it('should replace old temp file when dump is updated multiple times', async () => {
    const fixture = PlaywrightAiFixture();

    const agentForPageFn = fixture.agentForPage as any;
    const agent = await agentForPageFn(
      { page: mockPage },
      async (fn: any) => fn(),
      mockTestInfo,
    );

    // First dump update
    const dumpData1 = JSON.stringify({ version: 1 });
    if (agent.onDumpUpdate) {
      agent.onDumpUpdate(dumpData1);
    }

    const annotation1 = mockTestInfo.annotations.find(
      (a) => a.type === 'MIDSCENE_DUMP_ANNOTATION',
    );
    const tempFilePath1 = annotation1?.description as string;
    createdTempFiles.push(tempFilePath1);

    expect(existsSync(tempFilePath1)).toBe(true);

    // Wait a bit to ensure different timestamp
    await new Promise((resolve) => setTimeout(resolve, 10));

    // Second dump update
    const dumpData2 = JSON.stringify({ version: 2 });
    if (agent.onDumpUpdate) {
      agent.onDumpUpdate(dumpData2);
    }

    const annotation2 = mockTestInfo.annotations.find(
      (a) => a.type === 'MIDSCENE_DUMP_ANNOTATION',
    );
    const tempFilePath2 = annotation2?.description as string;
    createdTempFiles.push(tempFilePath2);

    // New file should exist
    expect(existsSync(tempFilePath2)).toBe(true);
    expect(tempFilePath2).not.toBe(tempFilePath1);

    // Old file should be cleaned up
    expect(existsSync(tempFilePath1)).toBe(false);

    // Verify new file content
    const fileContent = readFileSync(tempFilePath2, 'utf-8');
    expect(fileContent).toBe(dumpData2);
  });

  it('should clean up temp file when page is closed', async () => {
    const fixture = PlaywrightAiFixture();

    const agentForPageFn = fixture.agentForPage as any;
    const agent = await agentForPageFn(
      { page: mockPage },
      async (fn: any) => fn(),
      mockTestInfo,
    );

    // Trigger dump update to create temp file
    const dumpData = JSON.stringify({ test: 'data' });
    if (agent.onDumpUpdate) {
      agent.onDumpUpdate(dumpData);
    }

    const annotation = mockTestInfo.annotations.find(
      (a) => a.type === 'MIDSCENE_DUMP_ANNOTATION',
    );
    const tempFilePath = annotation?.description as string;
    createdTempFiles.push(tempFilePath);

    expect(existsSync(tempFilePath)).toBe(true);

    // Simulate page close
    if (pageCloseHandler) {
      pageCloseHandler();
    }

    // Temp file should be cleaned up
    expect(existsSync(tempFilePath)).toBe(false);
  });

  it('should handle cleanup gracefully when file is already deleted', async () => {
    const fixture = PlaywrightAiFixture();

    const agentForPageFn = fixture.agentForPage as any;
    const agent = await agentForPageFn(
      { page: mockPage },
      async (fn: any) => fn(),
      mockTestInfo,
    );

    // Trigger dump update
    const dumpData = JSON.stringify({ test: 'data' });
    if (agent.onDumpUpdate) {
      agent.onDumpUpdate(dumpData);
    }

    const annotation = mockTestInfo.annotations.find(
      (a) => a.type === 'MIDSCENE_DUMP_ANNOTATION',
    );
    const tempFilePath = annotation?.description as string;
    createdTempFiles.push(tempFilePath);

    // Manually delete the file (simulating external cleanup)
    const fs = require('node:fs');
    fs.rmSync(tempFilePath, { force: true });

    // Page close should not throw error
    expect(() => {
      if (pageCloseHandler) {
        pageCloseHandler();
      }
    }).not.toThrow();
  });

  it('should track multiple pages with separate temp files', async () => {
    const fixture = PlaywrightAiFixture();

    // Create mock for second page
    let pageCloseHandler2: (() => void) | null = null;
    const mockPage2: any = {
      on: vi.fn((event: string, handler: any) => {
        if (event === 'close') {
          pageCloseHandler2 = handler;
        }
      }),
      goto: vi.fn(),
      waitForLoadState: vi.fn(),
      evaluate: vi.fn(),
    };

    // Add context after mockPage2 is defined
    mockPage2.context = vi.fn().mockReturnValue({
      pages: vi.fn().mockReturnValue([mockPage2]),
    });

    const mockTestInfo2 = {
      testId: 'test-cleanup-456',
      titlePath: ['Test Suite', 'Test Case 2'],
      retry: 0,
      annotations: [],
    } as any;

    const agentForPageFn = fixture.agentForPage as any;

    // Create first agent
    const agent1 = await agentForPageFn(
      { page: mockPage },
      async (fn: any) => fn(),
      mockTestInfo,
    );

    // Create second agent
    const agent2 = await agentForPageFn(
      { page: mockPage2 },
      async (fn: any) => fn(),
      mockTestInfo2,
    );

    // Update dumps for both agents
    if (agent1.onDumpUpdate) {
      agent1.onDumpUpdate(JSON.stringify({ page: 1 }));
    }
    if (agent2.onDumpUpdate) {
      agent2.onDumpUpdate(JSON.stringify({ page: 2 }));
    }

    const annotation1 = mockTestInfo.annotations.find(
      (a) => a.type === 'MIDSCENE_DUMP_ANNOTATION',
    );
    const annotation2 = mockTestInfo2.annotations.find(
      (a) => a.type === 'MIDSCENE_DUMP_ANNOTATION',
    );

    const tempFilePath1 = annotation1?.description as string;
    const tempFilePath2 = annotation2?.description as string;

    createdTempFiles.push(tempFilePath1, tempFilePath2);

    // Both files should exist and be different
    expect(existsSync(tempFilePath1)).toBe(true);
    expect(existsSync(tempFilePath2)).toBe(true);
    expect(tempFilePath1).not.toBe(tempFilePath2);

    // Close first page
    if (pageCloseHandler) {
      pageCloseHandler();
    }

    // Only first file should be cleaned up
    expect(existsSync(tempFilePath1)).toBe(false);
    expect(existsSync(tempFilePath2)).toBe(true);

    // Close second page
    if (pageCloseHandler2) {
      pageCloseHandler2();
    }

    // Both files should be cleaned up
    expect(existsSync(tempFilePath1)).toBe(false);
    expect(existsSync(tempFilePath2)).toBe(false);
  });
});
