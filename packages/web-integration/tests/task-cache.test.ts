import { describe, it, expect, beforeEach } from 'vitest';
import Insight, { PlanningAction, UIContext } from '@midscene/core';
import { AiTaskCache, TaskCache } from '../src/common/task-cache'; // 假设 TaskCache 类在当前目录下
import { WebElementInfo } from '../src/web-element';

describe('TaskCache', () => {
  let size: { width: number; height: number };
  // let insightMock: Insight<WebElementInfo>;
  let taskCache: TaskCache;
  let pageContext: UIContext<WebElementInfo>;

  beforeEach(() => {
    size = {
      width: 700,
      height: 50,
    };
    pageContext = { size: { width: 1024, height: 768 }, content: [], screenshotBase64: '' };
    taskCache = new TaskCache(
      new Insight<WebElementInfo>(async () => {
        return Promise.resolve({
          content: [] as Array<WebElementInfo>,
          screenshotBase64: '',
          size,
        });
      }),
    );
  });

  describe('plan', () => {
    it('should return cached plan result if available', async () => {
      const locateElement = { id: 'newElement' } as WebElementInfo;
      const aiResponse = { plans: [{ thought: 'test', type: 'Locate', param: {} }] as PlanningAction[] };
      const cacheTask = {
        aiTasks: [
          {
            type: 'plan',
            prompt: 'testPrompt',
            pageContext: { url: '', ...size },
            response: aiResponse,
          },
        ],
      } as AiTaskCache;

      const taskCache = new TaskCache(
        new Insight<WebElementInfo>(async () => {
          return Promise.resolve({
            content: [locateElement] as Array<WebElementInfo>,
            screenshotBase64: '',
            size,
          });
        }),
        {
          cache: cacheTask,
        },
      );

      const result = await taskCache.plan('testPrompt');
      expect(result).toEqual(aiResponse);
    });

    it('should call plan function and cache the result if no valid cache', async () => {
      const aiResponse: any = { plans: [{ thought: 'test', type: 'Locate', param: {} }] as PlanningAction[] };

      const taskCache = new TaskCache(
        new Insight<WebElementInfo>(async () => {
          return Promise.resolve({
            content: [] as Array<WebElementInfo>,
            screenshotBase64: '',
            size,
          });
        }),
      );
      const result = await taskCache.plan('newTestPrompt', {
        callAI: async () => {
          return Promise.resolve({
            actions: aiResponse.plans,
          });
        },
      });

      expect(result).toEqual(aiResponse);
      expect(taskCache.generateTaskCache().aiTasks).toContainEqual({
        type: 'plan',
        prompt: 'newTestPrompt',
        pageContext: { url: '', ...size },
        response: aiResponse,
      });
    });
  });

  describe('locate', () => {
    it('should return cached locate result if available', async () => {
      const locateElement = { id: 'newElement' } as WebElementInfo;
      const aiResponse: any = {
        elements: [locateElement],
      } as any;
      const cacheTask = {
        aiTasks: [
          {
            type: 'locate',
            prompt: 'testPrompt',
            pageContext: { url: '', ...size },
            response: aiResponse,
          },
        ],
      } as AiTaskCache;

      const taskCache = new TaskCache(
        new Insight<WebElementInfo>(async () => {
          return Promise.resolve({
            content: [locateElement] as Array<WebElementInfo>,
            screenshotBase64: '',
            size,
          });
        }),
        {
          cache: cacheTask,
        },
      );

      const result = await taskCache.locate('testPrompt');

      expect(result).toEqual(aiResponse.elements[0]);
    });

    it('should call locate function and cache the result if no valid cache', async () => {
      const locateElement = { id: 'newElement' } as WebElementInfo;
      const aiResponse: any = {
        elements: [locateElement],
      } as any;
      const taskCache = new TaskCache(
        new Insight<WebElementInfo>(
          async () => {
            return Promise.resolve({
              content: [locateElement] as Array<WebElementInfo>,
              screenshotBase64: '',
              size,
            });
          },
          {
            aiVendorFn: async () => {
              return Promise.resolve(aiResponse);
            },
          },
        ),
      );
      const result = await taskCache.locate('newTestPrompt');

      expect(result).toEqual(locateElement);
      expect(taskCache.generateTaskCache().aiTasks).toContainEqual({
        type: 'locate',
        prompt: 'newTestPrompt',
        pageContext: { url: '', width: 700, height: 50 },
        response: aiResponse,
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
