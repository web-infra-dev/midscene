import { PageAgent } from '@/common/agent';
import type { WebPage, WebUIContext } from '@/common/page';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock page implementation
const mockPage = {
  pageType: 'puppeteer',
  mouse: {
    click: vi.fn(),
  },
  screenshotBase64: vi.fn().mockResolvedValue('mock-screenshot'),
  evaluateJavaScript: vi.fn(),
  size: vi.fn().mockResolvedValue({ width: 1920, height: 1080, dpr: 1 }),
} as unknown as WebPage;

describe('PageAgent freeze/unfreeze page context', () => {
  let agent: PageAgent;
  let mockContext: WebUIContext;
  let mockContext2: WebUIContext;

  beforeEach(() => {
    vi.clearAllMocks();

    // Create mock contexts
    mockContext = {
      size: { width: 1920, height: 1080, dpr: 1 },
      screenshotBase64: 'mock-screenshot-base64-1',
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
    } as unknown as WebUIContext;

    mockContext2 = {
      size: { width: 1920, height: 1080, dpr: 1 },
      screenshotBase64: 'mock-screenshot-base64-2',
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
    } as unknown as WebUIContext;

    // Create agent instance
    agent = new PageAgent(mockPage, {
      generateReport: false,
      autoPrintReportMsg: false,
    });

    // Mock _snapshotContext method to return different contexts on successive calls
    let callCount = 0;
    vi.spyOn(agent, '_snapshotContext').mockImplementation(async () => {
      callCount++;
      return callCount === 1 ? mockContext : mockContext2;
    });
  });

  describe('Basic freeze/unfreeze functionality', () => {
    it('should have correct initial state', () => {
      // Initially not frozen
      expect((agent as any).isPageContextFrozen).toBe(false);
      expect((agent as any).frozenPageContext).toBeUndefined();
    });

    it('should freeze page context successfully', async () => {
      // Freeze context
      await agent.freezePageContext();

      // Should be frozen with the context and marked as frozen
      expect((agent as any).isPageContextFrozen).toBe(true);
      expect((agent as any).frozenPageContext).toBeDefined();
      expect((agent as any).frozenPageContext._isFrozen).toBe(true);
      expect(agent._snapshotContext).toHaveBeenCalledOnce();
    });

    it('should unfreeze page context successfully', async () => {
      // First freeze the context
      await agent.freezePageContext();
      expect((agent as any).isPageContextFrozen).toBe(true);
      expect((agent as any).frozenPageContext).toBe(mockContext);

      // Then unfreeze
      await agent.unfreezePageContext();

      // Should be unfrozen
      expect((agent as any).isPageContextFrozen).toBe(false);
      expect((agent as any).frozenPageContext).toBeUndefined();
    });

    it('should be able to freeze multiple times', async () => {
      // First freeze
      await agent.freezePageContext();
      expect((agent as any).frozenPageContext).toBe(mockContext);

      // Second freeze should update the context
      await agent.freezePageContext();
      expect((agent as any).frozenPageContext).toBe(mockContext2);
      expect((agent as any).isPageContextFrozen).toBe(true);

      // Should be called twice
      expect(agent._snapshotContext).toHaveBeenCalledTimes(2);
    });

    it('should handle unfreeze when not frozen', async () => {
      // Should not throw error when unfreezing already unfrozen context
      await agent.unfreezePageContext();

      expect((agent as any).isPageContextFrozen).toBe(false);
      expect((agent as any).frozenPageContext).toBeUndefined();
    });

    it('should mark frozen context with _isFrozen flag', async () => {
      // Original context should not have _isFrozen flag
      expect(mockContext._isFrozen).toBeUndefined();

      // Freeze context
      await agent.freezePageContext();

      // Frozen context should be marked
      const frozenContext = (agent as any).frozenPageContext;
      expect(frozenContext._isFrozen).toBe(true);
      expect(frozenContext.screenshotBase64).toBe(mockContext.screenshotBase64);
      expect(frozenContext.tree).toBe(mockContext.tree);
    });

    it('should preserve frozen flag across multiple operations', async () => {
      await agent.freezePageContext();

      const frozenContext = (agent as any).frozenPageContext;
      expect(frozenContext._isFrozen).toBe(true);

      // buildDetailedLocateParam no longer returns pageContext
      const result = (agent as any).buildDetailedLocateParam('test');
      expect(result.pageContext).toBeUndefined();

      // But frozen context should still be marked and available via getUIContext
      expect(frozenContext._isFrozen).toBe(true);
      const contextViaGetUIContext = await agent.getUIContext('locate');
      expect(contextViaGetUIContext._isFrozen).toBe(true);
    });
  });

  describe('buildDetailedLocateParam after simplification', () => {
    it('should not include pageContext in the result', async () => {
      // Test with options
      const result1 = (agent as any).buildDetailedLocateParam('test prompt', {
        deepThink: true,
        cacheable: false,
        xpath: '/html/body/button',
      });

      // Should not include pageContext
      expect(result1).toEqual({
        prompt: 'test prompt',
        deepThink: true,
        cacheable: false,
        xpath: '/html/body/button',
      });
      expect(result1.pageContext).toBeUndefined();

      // Test without options
      const result2 = (agent as any).buildDetailedLocateParam('another prompt');

      // Should also not include pageContext
      expect(result2).toEqual({
        prompt: 'another prompt',
      });
      expect(result2.pageContext).toBeUndefined();
    });

    it('should work correctly with freeze/unfreeze through contextRetrieverFn', async () => {
      // The insight's contextRetrieverFn should respect frozen state
      // Initially not frozen
      expect((agent as any).isPageContextFrozen).toBe(false);

      // Freeze context
      await agent.freezePageContext();
      expect((agent as any).isPageContextFrozen).toBe(true);

      // The frozen context should be used when calling locate
      const detailedParam = (agent as any).buildDetailedLocateParam(
        'test prompt',
      );
      expect(detailedParam.pageContext).toBeUndefined(); // No pageContext in param anymore

      // But the agent's frozen context should be available via getUIContext
      const frozenContext = (agent as any).frozenPageContext;
      expect(frozenContext).toBe(mockContext);
      expect(frozenContext._isFrozen).toBe(true);

      // Unfreeze
      await agent.unfreezePageContext();
      expect((agent as any).isPageContextFrozen).toBe(false);
      expect((agent as any).frozenPageContext).toBeUndefined();
    });
  });

  describe('Context isolation and lifecycle', () => {
    it('should not share context between different agents', async () => {
      const agent2 = new PageAgent(mockPage, {
        generateReport: false,
        autoPrintReportMsg: false,
      });

      // Mock second agent's _snapshotContext
      vi.spyOn(agent2, '_snapshotContext').mockResolvedValue(mockContext2);

      // Freeze context for agent1 only
      await agent.freezePageContext();

      // agent1 should have frozen context
      expect((agent as any).isPageContextFrozen).toBe(true);
      expect((agent as any).frozenPageContext).toBe(mockContext);

      // agent2 should not have frozen context
      expect((agent2 as any).isPageContextFrozen).toBe(false);
      expect((agent2 as any).frozenPageContext).toBeUndefined();

      // Freeze agent2
      await agent2.freezePageContext();

      // Both should now have their own frozen contexts
      expect((agent as any).frozenPageContext).toBe(mockContext);
      expect((agent2 as any).frozenPageContext).toBe(mockContext2);

      // Unfreeze agent1
      await agent.unfreezePageContext();

      // agent1 should be unfrozen, agent2 should still be frozen
      expect((agent as any).isPageContextFrozen).toBe(false);
      expect((agent2 as any).isPageContextFrozen).toBe(true);
    });

    it('should not share context between different freeze cycles', async () => {
      // First freeze cycle
      await agent.freezePageContext();
      const firstFrozenContext = (agent as any).frozenPageContext;
      await agent.unfreezePageContext();

      // Second freeze cycle
      await agent.freezePageContext();
      const secondFrozenContext = (agent as any).frozenPageContext;

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
      expect((agent as any).isPageContextFrozen).toBe(true);
      expect((agent as any).frozenPageContext).toBeDefined();

      // Should have called _snapshotContext 3 times (for each freeze)
      expect(agent._snapshotContext).toHaveBeenCalledTimes(3);
    });
  });

  describe('Integration with buildDetailedLocateParam edge cases', () => {
    it('should handle all option combinations correctly', async () => {
      // Test with all possible option combinations
      const testCases = [
        {},
        { deepThink: true },
        { cacheable: false },
        { xpath: '/html/body/div' },
        { deepThink: true, cacheable: false },
        { deepThink: true, xpath: '/html/body/span' },
        { cacheable: false, xpath: '/html/body/input' },
        { deepThink: true, cacheable: false, xpath: '/html/body/button' },
      ];

      testCases.forEach((options, index) => {
        const result = (agent as any).buildDetailedLocateParam(
          `prompt${index}`,
          options,
        );

        // Should not include pageContext
        expect(result.pageContext).toBeUndefined();
        expect(result.prompt).toBe(`prompt${index}`);

        // Check other properties are preserved
        if (options.deepThink !== undefined) {
          expect(result.deepThink).toBe(options.deepThink);
        } else if (Object.keys(options).length > 0) {
          expect(result.deepThink).toBe(false); // default value
        }
        if (options.cacheable !== undefined) {
          expect(result.cacheable).toBe(options.cacheable);
        } else if (Object.keys(options).length > 0) {
          expect(result.cacheable).toBe(true); // default value
        }
        if (options.xpath !== undefined) {
          expect(result.xpath).toBe(options.xpath);
        }
      });
    });

    it('should handle null and undefined options correctly', async () => {
      // Test with null options (should be treated as no options)
      const result1 = (agent as any).buildDetailedLocateParam('prompt1', null);
      expect(result1).toEqual({
        prompt: 'prompt1',
      });
      expect(result1.pageContext).toBeUndefined();

      // Test with undefined options
      const result2 = (agent as any).buildDetailedLocateParam(
        'prompt2',
        undefined,
      );
      expect(result2).toEqual({
        prompt: 'prompt2',
      });
      expect(result2.pageContext).toBeUndefined();

      // Test with empty object
      const result3 = (agent as any).buildDetailedLocateParam('prompt3', {});
      expect(result3).toEqual({
        prompt: 'prompt3',
        deepThink: false,
        cacheable: true,
        xpath: undefined,
      });
      expect(result3.pageContext).toBeUndefined();
    });
  });

  describe('Memory management', () => {
    it('should clean up frozen context when unfreezing', async () => {
      // Freeze context
      await agent.freezePageContext();
      const contextRef = (agent as any).frozenPageContext;
      expect(contextRef).toBeDefined();

      // Unfreeze
      await agent.unfreezePageContext();

      // Reference should be cleared
      expect((agent as any).frozenPageContext).toBeUndefined();

      // Verify the context object itself is no longer referenced by agent
      expect((agent as any).frozenPageContext).not.toBe(contextRef);
    });

    it('should replace old context when freezing multiple times', async () => {
      // First freeze
      await agent.freezePageContext();
      const firstContext = (agent as any).frozenPageContext;

      // Second freeze should replace the context
      await agent.freezePageContext();
      const secondContext = (agent as any).frozenPageContext;

      expect(firstContext).not.toBe(secondContext);
      expect(secondContext).toBe(mockContext2);
    });
  });

  describe('getUIContext with frozen context', () => {
    it('should return frozen context for all actions when frozen', async () => {
      // Mock parseContextFromWebPage to return a new context each time
      const mockParseContext = vi.fn().mockResolvedValue(mockContext2);
      vi.spyOn(
        await import('@/common/utils'),
        'parseContextFromWebPage',
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

        // Should return the frozen context, not call parseContextFromWebPage
        expect(context).toBe(mockContext);
        expect(context._isFrozen).toBe(true);
      }

      // parseContextFromWebPage should not be called when frozen
      expect(mockParseContext).not.toHaveBeenCalled();
    });

    it('should return fresh context for all actions when not frozen', async () => {
      // Mock parseContextFromWebPage
      const mockParseContext = vi
        .fn()
        .mockResolvedValueOnce({ ...mockContext, fresh: 1 })
        .mockResolvedValueOnce({ ...mockContext, fresh: 2 })
        .mockResolvedValueOnce({ ...mockContext, fresh: 3 });

      vi.spyOn(
        await import('@/common/utils'),
        'parseContextFromWebPage',
      ).mockImplementation(mockParseContext);

      // Test without freezing
      const context1 = await agent.getUIContext('locate');
      const context2 = await agent.getUIContext('extract');
      const context3 = await agent.getUIContext('assert');

      // Each call should get a fresh context
      expect(context1.fresh).toBe(1);
      expect(context2.fresh).toBe(2);
      expect(context3.fresh).toBe(3);

      // parseContextFromWebPage should be called for each
      expect(mockParseContext).toHaveBeenCalledTimes(3);
    });

    it('should switch between frozen and fresh contexts correctly', async () => {
      // Mock parseContextFromWebPage
      const mockParseContext = vi
        .fn()
        .mockResolvedValueOnce({ ...mockContext2, callNumber: 1 })
        .mockResolvedValueOnce({ ...mockContext2, callNumber: 2 });

      vi.spyOn(
        await import('@/common/utils'),
        'parseContextFromWebPage',
      ).mockImplementation(mockParseContext);

      // Get fresh context initially
      const freshContext1 = await agent.getUIContext('locate');
      expect(freshContext1.callNumber).toBe(1);

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
      expect(freshContext2.callNumber).toBe(2);

      // Total calls: 2 (initial fresh + after unfreeze)
      expect(mockParseContext).toHaveBeenCalledTimes(2);
    });

    it('should handle extract and assert actions correctly when frozen', async () => {
      // Mock parseContextFromWebPage
      const mockParseContext = vi.fn().mockResolvedValue(mockContext2);
      vi.spyOn(
        await import('@/common/utils'),
        'parseContextFromWebPage',
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

      // parseContextFromWebPage should not be called
      expect(mockParseContext).not.toHaveBeenCalled();
    });
  });
});
