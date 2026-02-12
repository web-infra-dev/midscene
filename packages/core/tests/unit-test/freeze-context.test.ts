import { Agent as PageAgent, commonContextParser } from '@/agent';
import type { AbstractInterface } from '@/device';
import { ScreenshotItem } from '@/screenshot-item';
import type { UIContext } from '@/types';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock page implementation
const mockPage = {
  interfaceType: 'puppeteer',
  mouse: {
    click: vi.fn(),
  },
  actionSpace: vi.fn(() => []),
  screenshotBase64: vi.fn().mockResolvedValue('mock-screenshot'),
  evaluateJavaScript: vi.fn(),
  size: vi.fn().mockResolvedValue({ width: 1920, height: 1080 }),
  url: vi.fn().mockResolvedValue('https://example.com'),
  getContext: vi.fn().mockImplementation(async function (
    this: AbstractInterface,
  ) {
    return await commonContextParser(this, {});
  }),
} as unknown as AbstractInterface;

const mockedModelConfig = {
  MIDSCENE_MODEL_NAME: 'mock-model',
  MIDSCENE_MODEL_API_KEY: 'mock-api-key',
  MIDSCENE_MODEL_BASE_URL: 'mock-base-url',
};

describe('PageAgent freeze/unfreeze page context', () => {
  let agent: PageAgent;
  let mockContext: UIContext;
  let mockContext2: UIContext;

  beforeEach(async () => {
    vi.clearAllMocks();

    // Create mock contexts
    mockContext = {
      shotSize: { width: 1920, height: 1080 },
      shrunkShotToLogicalRatio: 1,
      screenshot: ScreenshotItem.create(
        'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      ),
      tree: [
        {
          id: 'element1',
          locator: 'button',
          content: 'Button 1',
          rect: { left: 10, top: 10, width: 100, height: 30 },
          center: [60, 25],
          attributes: {},
        },
      ],
    } as unknown as UIContext;

    mockContext2 = {
      shotSize: { width: 1920, height: 1080 },
      shrunkShotToLogicalRatio: 1,
      screenshot: ScreenshotItem.create(
        'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==',
      ),
      tree: [
        {
          id: 'element2',
          locator: 'input',
          content: 'Input Field',
          rect: { left: 20, top: 50, width: 200, height: 25 },
          center: [120, 62],
          attributes: {},
        },
      ],
    } as unknown as UIContext;

    // Create agent instance
    // @ts-expect-error - access private property _id in test
    agent = new PageAgent(mockPage, {
      generateReport: false,
      autoPrintReportMsg: false,
      modelConfig: mockedModelConfig,
    });

    // Mock _snapshotContext method to return different contexts on successive calls
    let callCount = 0;
    // @ts-expect-error - access private property _id in test
    vi.spyOn(agent, '_snapshotContext').mockImplementation(async () => {
      callCount++;
      return callCount === 1 ? mockContext : mockContext2;
    });
  });

  describe('Basic freeze/unfreeze functionality', () => {
    it('should have correct initial state', () => {
      // Initially not frozen
      expect((agent as any).frozenUIContext).toBeUndefined();
    });

    it('should freeze page context successfully', async () => {
      // Freeze context
      await agent.freezePageContext();

      // Should be frozen with the context and marked as frozen
      expect((agent as any).frozenUIContext).toBeDefined();
      expect((agent as any).frozenUIContext._isFrozen).toBe(true);
      expect(agent._snapshotContext).toHaveBeenCalledOnce();
    });

    it('should unfreeze page context successfully', async () => {
      // First freeze the context
      await agent.freezePageContext();
      expect((agent as any).frozenUIContext).toBe(mockContext);

      // Then unfreeze
      await agent.unfreezePageContext();

      // Should be unfrozen
      expect((agent as any).frozenUIContext).toBeUndefined();
    });

    it('should be able to freeze multiple times', async () => {
      // First freeze
      await agent.freezePageContext();
      expect((agent as any).frozenUIContext).toBe(mockContext);

      // Second freeze should update the context
      await agent.freezePageContext();
      expect((agent as any).frozenUIContext).toBe(mockContext2);

      // Should be called twice
      expect(agent._snapshotContext).toHaveBeenCalledTimes(2);
    });

    it('should handle unfreeze when not frozen', async () => {
      // Should not throw error when unfreezing already unfrozen context
      await agent.unfreezePageContext();

      expect((agent as any).frozenUIContext).toBeUndefined();
    });

    it('should mark frozen context with _isFrozen flag', async () => {
      // Original context should not have _isFrozen flag
      expect(mockContext._isFrozen).toBeUndefined();

      // Freeze context
      await agent.freezePageContext();

      // Frozen context should be marked
      const frozenContext = (agent as any).frozenUIContext;
      expect(frozenContext._isFrozen).toBe(true);
      const screenshotData = frozenContext.screenshot.base64;
      expect(screenshotData).toBe(
        'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      );
    });

    it('should preserve frozen flag across multiple operations', async () => {
      await agent.freezePageContext();

      const frozenContext = (agent as any).frozenUIContext;
      expect(frozenContext._isFrozen).toBe(true);

      // But frozen context should still be marked and available via getUIContext
      expect(frozenContext._isFrozen).toBe(true);
      const contextViaGetUIContext = await agent.getUIContext('locate');
      expect(contextViaGetUIContext._isFrozen).toBe(true);
    });
  });

  describe('Context isolation and lifecycle', () => {
    it('should not share context between different agents', async () => {
      // @ts-expect-error - access private property _id in test
      const agent2 = new PageAgent(mockPage, {
        generateReport: false,
        autoPrintReportMsg: false,
        modelConfig: mockedModelConfig,
      });

      // Mock second agent's _snapshotContext
      // @ts-expect-error - access private property _id in test
      vi.spyOn(agent2, '_snapshotContext').mockResolvedValue(mockContext2);

      // Freeze context for agent1 only
      await agent.freezePageContext();

      // agent1 should have frozen context
      expect((agent as any).frozenUIContext).toBe(mockContext);

      // agent2 should not have frozen context
      expect((agent2 as any).frozenUIContext).toBeUndefined();

      // Freeze agent2
      await agent2.freezePageContext();

      // Both should now have their own frozen contexts
      expect((agent as any).frozenUIContext).toBe(mockContext);
      expect((agent2 as any).frozenUIContext).toBe(mockContext2);

      // Unfreeze agent1
      await agent.unfreezePageContext();

      // agent1 should be unfrozen, agent2 should still be frozen
      expect((agent as any).frozenUIContext).toBeUndefined();
      expect((agent2 as any).frozenUIContext).toBe(mockContext2);
    });

    it('should not share context between different freeze cycles', async () => {
      // First freeze cycle
      await agent.freezePageContext();
      const firstFrozenContext = (agent as any).frozenUIContext;
      await agent.unfreezePageContext();

      // Second freeze cycle
      await agent.freezePageContext();
      const secondFrozenContext = (agent as any).frozenUIContext;

      // Should have different contexts
      expect(firstFrozenContext).toBe(mockContext);
      expect(secondFrozenContext).toBe(mockContext2);
      expect(firstFrozenContext).not.toBe(secondFrozenContext);

      // _snapshotContext should be called twice (once for each freeze)
      expect(agent._snapshotContext).toHaveBeenCalledTimes(2);
    });

    it('should handle rapid freeze/unfreeze cycles', async () => {
      // Rapid cycles
      await agent.freezePageContext();
      await agent.unfreezePageContext();
      await agent.freezePageContext();
      await agent.unfreezePageContext();
      await agent.freezePageContext();

      // Final state should be frozen
      expect((agent as any).frozenUIContext).toBeDefined();

      // Should have called _snapshotContext 3 times (for each freeze)
      expect(agent._snapshotContext).toHaveBeenCalledTimes(3);
    });
  });

  describe('getUIContext with frozen context', () => {
    it('should return frozen context for all actions when frozen', async () => {
      // Mock commonContextParser to return a new context each time
      const mockParseContext = vi.fn().mockResolvedValue(mockContext2);
      vi.spyOn(
        await import('@/agent/utils'),
        'commonContextParser',
      ).mockImplementation(mockParseContext);

      // Freeze context
      await agent.freezePageContext();

      // Test all action types
      const actions = [
        'locate',
        'extract',
        'assert',
        'describe',
        undefined,
      ] as const;

      for (const action of actions) {
        const context = await agent.getUIContext(action);

        // Should return the frozen context, not call commonContextParser
        expect(context).toBe(mockContext);
        expect(context._isFrozen).toBe(true);
      }

      // commonContextParser should not be called when frozen
      expect(mockParseContext).not.toHaveBeenCalled();
    });

    it('should return fresh context for all actions when not frozen', async () => {
      // Mock commonContextParser
      const mockParseContext = vi
        .fn()
        .mockResolvedValueOnce({ ...mockContext, fresh: 1 })
        .mockResolvedValueOnce({ ...mockContext, fresh: 2 })
        .mockResolvedValueOnce({ ...mockContext, fresh: 3 });

      vi.spyOn(
        await import('@/agent/utils'),
        'commonContextParser',
      ).mockImplementation(mockParseContext);

      // Test without freezing
      const context1 = await agent.getUIContext('locate');
      const context2 = await agent.getUIContext('extract');
      const context3 = await agent.getUIContext('assert');

      // Each call should get a fresh context
      expect((context1 as any).fresh).toBe(1);
      expect((context2 as any).fresh).toBe(2);
      expect((context3 as any).fresh).toBe(3);

      // commonContextParser should be called for each
      expect(mockParseContext).toHaveBeenCalledTimes(3);
    });

    it('should switch between frozen and fresh contexts correctly', async () => {
      // Mock commonContextParser
      const mockParseContext = vi
        .fn()
        .mockResolvedValueOnce({ ...mockContext2, callNumber: 1 })
        .mockResolvedValueOnce({ ...mockContext2, callNumber: 2 });

      vi.spyOn(
        await import('@/agent/utils'),
        'commonContextParser',
      ).mockImplementation(mockParseContext);

      // Get fresh context initially
      const freshContext1 = await agent.getUIContext('locate');
      expect((freshContext1 as any).callNumber).toBe(1);

      // Freeze context
      await agent.freezePageContext();

      // Should return frozen context now
      const frozenContext = await agent.getUIContext('locate');
      expect(frozenContext).toBe(mockContext);
      expect(frozenContext._isFrozen).toBe(true);

      // Unfreeze
      await agent.unfreezePageContext();

      // Should return fresh context again
      const freshContext2 = await agent.getUIContext('locate');
      expect((freshContext2 as any).callNumber).toBe(2);

      // Total calls: 2 (initial fresh + after unfreeze)
      expect(mockParseContext).toHaveBeenCalledTimes(2);
    });

    it('should handle extract and assert actions correctly when frozen', async () => {
      // Mock commonContextParser
      const mockParseContext = vi.fn().mockResolvedValue(mockContext2);
      vi.spyOn(
        await import('@/agent/utils'),
        'commonContextParser',
      ).mockImplementation(mockParseContext);

      // Freeze context
      await agent.freezePageContext();

      // Test extract action
      const extractContext = await agent.getUIContext('extract');
      expect(extractContext).toBe(mockContext);
      expect(extractContext._isFrozen).toBe(true);

      // Test assert action
      const assertContext = await agent.getUIContext('assert');
      expect(assertContext).toBe(mockContext);
      expect(assertContext._isFrozen).toBe(true);

      // commonContextParser should not be called
      expect(mockParseContext).not.toHaveBeenCalled();
    });
  });
});
