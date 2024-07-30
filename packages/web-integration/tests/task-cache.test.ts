import { describe, it, expect, beforeEach, vi, Mock } from 'vitest';
import Insight, { PlanningAction, UIContext, plan } from '@midscene/core';
import { LocateTask, TaskCache } from '../src/common/task-cache'; // 假设 TaskCache 类在当前目录下
import { WebElementInfo } from '../src/web-element';

// Mocking the dependencies
vi.mock('@midscene/core', () => ({
  plan: vi.fn(),
}));

describe('TaskCache', () => {
  let insightMock: Insight<WebElementInfo>;
  let taskCache: TaskCache;
  let pageContext: UIContext<WebElementInfo>;

  beforeEach(() => {
    insightMock = {
      contextRetrieverFn: vi.fn(),
      locate: vi.fn(),
    } as unknown as Insight<WebElementInfo>;
    taskCache = new TaskCache(insightMock);
    pageContext = { size: { width: 1024, height: 768 }, content: [], screenshotBase64: '' };
  });

  describe('plan', () => {
    it('should return cached plan result if available', async () => {
      const cachedPlan = { plans: [{ thought: 'test', type: 'Locate', param: {} }] as PlanningAction[] };
      taskCache.cache = {
        aiTasks: [
          {
            type: 'plan',
            prompt: 'testPrompt',
            pageContext: { url: '', width: 1024, height: 768 },
            response: cachedPlan,
          },
        ],
      };

      (insightMock.contextRetrieverFn as Mock).mockResolvedValue(pageContext);

      const result = await taskCache.plan('testPrompt');

      expect(result).toEqual(cachedPlan);
    });

    it('should call plan function and cache the result if no valid cache', async () => {
      const newPlan = { plans: [{ thought: 'test', type: 'Locate', param: {} }] as PlanningAction[] };
      (insightMock.contextRetrieverFn as Mock).mockResolvedValue(pageContext);
      (plan as Mock).mockResolvedValue(newPlan);

      const result = await taskCache.plan('newTestPrompt');

      expect(result).toEqual(newPlan);
      expect(taskCache.newCache.aiTasks).toContainEqual({
        type: 'plan',
        prompt: 'newTestPrompt',
        pageContext: { url: '', width: 1024, height: 768 },
        response: newPlan,
      });
    });
  });

  describe('locate', () => {
    it('should return cached locate result if available', async () => {
      const cachedLocate = {
        output: {
          element: { id: 'element1' } as WebElementInfo,
        },
        log: {
          dump: undefined,
        },
      } as LocateTask['response'];
      taskCache.cache = {
        aiTasks: [
          {
            type: 'locate',
            prompt: 'testPrompt',
            pageContext: { url: '', width: 1024, height: 768 },
            response: cachedLocate,
          },
        ],
      };

      pageContext.content = [{ id: 'element1' } as WebElementInfo];
      (insightMock.contextRetrieverFn as Mock).mockResolvedValue(pageContext);

      const result = await taskCache.locate('testPrompt');

      expect(result).toEqual(cachedLocate);
    });

    it('should call locate function and cache the result if no valid cache', async () => {
      const locateElement = { id: 'newElement' } as WebElementInfo;
      const newLocate = {
        output: {
          element: locateElement,
        },
        log: {
          dump: undefined,
        },
      };
      (insightMock.contextRetrieverFn as Mock).mockResolvedValue(pageContext);
      (insightMock.locate as Mock).mockResolvedValue(locateElement);

      const result = await taskCache.locate('newTestPrompt');

      expect(result).toEqual(newLocate);
      expect(taskCache.newCache.aiTasks).toContainEqual({
        type: 'locate',
        prompt: 'newTestPrompt',
        pageContext: { url: '', width: 1024, height: 768 },
        response: newLocate,
      });
    });
  });

  describe('readCache', () => {
    it('should return false if no cache available', async () => {
      const result = await taskCache.readCache(pageContext, 'plan', 'testPrompt');
      expect(result).toBe(false);
    });

    it('should return cached response if cache is valid', async () => {
      const cachedResponse = {
        plans: [{ thought: 'test', type: 'Locate', param: {} }] as PlanningAction<any>[],
      };
      taskCache.cache = {
        aiTasks: [
          {
            type: 'plan',
            prompt: 'testPrompt',
            pageContext: { url: '', width: 1024, height: 768 },
            response: cachedResponse,
          },
        ],
      };

      const result = await taskCache.readCache(pageContext, 'plan', 'testPrompt');
      expect(result).toEqual(cachedResponse);
    });
  });

  describe('pageContextEqual', () => {
    it('should return true if page contexts are equal', () => {
      const pageContext1 = { url: '', width: 1024, height: 768 };
      const pageContext2 = { size: { width: 1024, height: 768 } } as UIContext<WebElementInfo>;

      const result = taskCache.pageContextEqual(pageContext1, pageContext2);
      expect(result).toBe(true);
    });

    it('should return false if page contexts are not equal', () => {
      const pageContext1 = { url: '', width: 1024, height: 768 };
      const pageContext2 = { size: { width: 800, height: 600 } } as UIContext<WebElementInfo>;

      const result = taskCache.pageContextEqual(pageContext1, pageContext2);
      expect(result).toBe(false);
    });
  });

  describe('generateTaskCache', () => {
    it('should return new cache object', () => {
      const result = taskCache.generateTaskCache();
      expect(result).toEqual(taskCache.newCache);
    });
  });
});
