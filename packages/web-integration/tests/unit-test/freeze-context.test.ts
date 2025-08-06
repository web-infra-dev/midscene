import { PageAgent } from '@/common/agent';
import type { WebPage } from '@/common/page';
import type { WebUIContext } from '@/common/utils';
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

      // Use frozen context in buildDetailedLocateParam
      const result = (agent as any).buildDetailedLocateParam('test');
      expect(result.pageContext._isFrozen).toBe(true);

      // Original frozen context should still be marked
      expect(frozenContext._isFrozen).toBe(true);
    });
  });

  describe('buildDetailedLocateParam integration', () => {
    it('should use frozen context when frozen', async () => {
      // Freeze context first
      await agent.freezePageContext();

      // Call buildDetailedLocateParam with options
      const result1 = (agent as any).buildDetailedLocateParam('test prompt', {
        deepThink: true,
        cacheable: false,
        xpath: '/html/body/button',
      });

      // Should include the frozen context
      expect(result1).toEqual({
        prompt: 'test prompt',
        deepThink: true,
        cacheable: false,
        xpath: '/html/body/button',
        pageContext: expect.objectContaining({
          _isFrozen: true,
          screenshotBase64: mockContext.screenshotBase64,
        }),
      });

      // Call buildDetailedLocateParam without options
      const result2 = (agent as any).buildDetailedLocateParam('another prompt');

      // Should also include the frozen context
      expect(result2).toEqual({
        prompt: 'another prompt',
        pageContext: expect.objectContaining({
          _isFrozen: true,
          screenshotBase64: mockContext.screenshotBase64,
        }),
      });
    });

    it('should not use frozen context when not frozen', async () => {
      // Don't freeze context

      // Call buildDetailedLocateParam with options
      const result1 = (agent as any).buildDetailedLocateParam('test prompt', {
        deepThink: true,
        cacheable: false,
        xpath: '/html/body/button',
      });

      // Should not include frozen context
      expect(result1).toEqual({
        prompt: 'test prompt',
        deepThink: true,
        cacheable: false,
        xpath: '/html/body/button',
        pageContext: undefined,
      });

      // Call buildDetailedLocateParam without options
      const result2 = (agent as any).buildDetailedLocateParam('another prompt');

      // Should also not include frozen context
      expect(result2).toEqual({
        prompt: 'another prompt',
        pageContext: undefined,
      });
    });

    it('should switch between frozen and unfrozen states correctly', async () => {
      // Initial state - not frozen
      let result = (agent as any).buildDetailedLocateParam('prompt1');
      expect(result.pageContext).toBeUndefined();

      // Freeze
      await agent.freezePageContext();
      result = (agent as any).buildDetailedLocateParam('prompt2');
      expect(result.pageContext).toBe(mockContext);

      // Unfreeze
      await agent.unfreezePageContext();
      result = (agent as any).buildDetailedLocateParam('prompt3');
      expect(result.pageContext).toBeUndefined();

      // Freeze again
      await agent.freezePageContext();
      result = (agent as any).buildDetailedLocateParam('prompt4');
      expect(result.pageContext._isFrozen).toBe(true);
      expect(result.pageContext.screenshotBase64).toBe(
        mockContext2.screenshotBase64,
      ); // Should be the second context
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
    it('should handle all option combinations when frozen', async () => {
      await agent.freezePageContext();

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

        expect(result.pageContext._isFrozen).toBe(true);
        expect(result.pageContext.screenshotBase64).toBe(
          mockContext.screenshotBase64,
        );
        expect(result.prompt).toBe(`prompt${index}`);

        // Check other properties are preserved
        if (options.deepThink !== undefined) {
          expect(result.deepThink).toBe(options.deepThink);
        }
        if (options.cacheable !== undefined) {
          expect(result.cacheable).toBe(options.cacheable);
        }
        if (options.xpath !== undefined) {
          expect(result.xpath).toBe(options.xpath);
        }
      });
    });

    it('should handle null and undefined options when frozen', async () => {
      await agent.freezePageContext();

      // Test with null options (should be treated as no options)
      const result1 = (agent as any).buildDetailedLocateParam('prompt1', null);
      expect(result1).toEqual({
        prompt: 'prompt1',
        pageContext: expect.objectContaining({
          _isFrozen: true,
          screenshotBase64: mockContext.screenshotBase64,
        }),
      });

      // Test with undefined options
      const result2 = (agent as any).buildDetailedLocateParam(
        'prompt2',
        undefined,
      );
      expect(result2).toEqual({
        prompt: 'prompt2',
        pageContext: expect.objectContaining({
          _isFrozen: true,
          screenshotBase64: mockContext.screenshotBase64,
        }),
      });

      // Test with empty object
      const result3 = (agent as any).buildDetailedLocateParam('prompt3', {});
      expect(result3).toEqual({
        prompt: 'prompt3',
        deepThink: false,
        cacheable: true,
        xpath: undefined,
        pageContext: expect.objectContaining({
          _isFrozen: true,
          screenshotBase64: mockContext.screenshotBase64,
        }),
      });
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
});
