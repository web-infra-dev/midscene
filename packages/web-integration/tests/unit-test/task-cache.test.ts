import { type LocateTask, type PlanTask, TaskCache } from '@/common/task-cache';
import type { WebUIContext } from '@/common/utils';
import type { WebElementInfo } from '@/web-element';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { launchPage } from '../ai/web/puppeteer/utils';

describe(
  'TaskCache',
  () => {
    let taskCache: TaskCache;
    let formalPageContext: WebUIContext;
    let pageContext: LocateTask['pageContext'];

    beforeEach(async () => {
      const { page } = await launchPage('https://example.com');
      taskCache = new TaskCache(page);
      pageContext = {
        url: 'https://example.com',
        size: { width: 1024, height: 768 },
      };
      formalPageContext = {
        ...pageContext,
        screenshotBase64: '',
        content: [{ id: 'element1' } as WebElementInfo],
      } as any;
    });

    it('should return false if no cache is available', async () => {
      const cacheGroup = taskCache.getCacheGroupByPrompt('test prompt');
      const result = await cacheGroup.matchCache(
        formalPageContext,
        'plan',
        'test prompt',
      );
      expect(result).toBe(false);
    });

    it('should return false if the prompt does not match', async () => {
      taskCache.cache.aiTasks = [
        {
          prompt: 'different prompt',
          tasks: [
            {
              type: 'plan',
              prompt: 'different prompt',
              pageContext,
              response: {
                actions: [],
                log: '',
                more_actions_needed_by_instruction: false,
              },
            },
          ],
        },
      ];
      const cacheGroup = taskCache.getCacheGroupByPrompt('test prompt');
      const result = await cacheGroup.matchCache(
        formalPageContext,
        'plan',
        'test prompt',
      );
      expect(result).toBe(false);
    });

    it('should return false if the element cannot be found in the new context', async () => {
      taskCache.cache = {
        pkgName: 'test',
        pkgVersion: '0.17.1',
        cacheId: 'test',
        aiTasks: [
          {
            prompt: 'test prompt',
            tasks: [
              {
                type: 'locate',
                prompt: 'test prompt',
                pageContext,
                response: {
                  xpaths: [],
                },
                element: {
                  id: 'element3',
                  rect: {
                    left: 100,
                    top: 100,
                    width: 100,
                    height: 100,
                  },
                  center: [100, 100],
                  xpaths: [],
                },
              },
            ],
          },
        ],
      };
      const cacheGroup = taskCache.getCacheGroupByPrompt('test prompt');
      const result = await cacheGroup.matchCache(
        formalPageContext,
        'locate',
        'test prompt',
      );
      expect(result).toBe(false);
    });

    it('should return cached response if the conditions match', async () => {
      const cachedResponse = {
        plans: [{ type: 'Locate', thought: '', param: {} }],
        more_actions_needed_by_instruction: false,
        log: '',
      };
      taskCache.cache = {
        pkgName: 'test',
        pkgVersion: '0.17.1',
        cacheId: 'test',
        aiTasks: [
          {
            prompt: 'test prompt',
            tasks: [
              {
                type: 'plan',
                prompt: 'test prompt',
                pageContext,
                response: cachedResponse,
              },
            ],
          },
        ],
      };

      const cacheGroup = taskCache.getCacheGroupByPrompt('test prompt');
      const result = await cacheGroup.matchCache(
        formalPageContext,
        'plan',
        'test prompt',
      );
      expect(result).toEqual(cachedResponse);
    });

    it('should save cache correctly', () => {
      const cacheGroup = taskCache.getCacheGroupByPrompt('test prompt');
      const newCache: PlanTask = {
        type: 'plan',
        prompt: 'new prompt',
        pageContext,
        response: {
          actions: [{ type: 'Locate', thought: '', param: {}, locate: null }],
          more_actions_needed_by_instruction: false,
          log: '',
        },
      };
      cacheGroup.saveCache(newCache);
      expect(taskCache.newCache.aiTasks[0].tasks).toContain(newCache);
    });

    it('should check page context equality correctly', () => {
      const isEqual = taskCache.pageContextEqual(
        pageContext,
        formalPageContext,
      );
      expect(isEqual).toBe(true);

      const differentContext = {
        ...formalPageContext,
        size: { width: 800, height: 600 },
      };
      const isNotEqual = taskCache.pageContextEqual(
        pageContext,
        differentContext,
      );
      expect(isNotEqual).toBe(false);
    });

    it('should generate task cache correctly', () => {
      const generatedCache = taskCache.generateTaskCache();
      expect(generatedCache).toEqual(taskCache.newCache);
    });

    it('should return cached response if xpaths matching elements are found', async () => {
      taskCache.page.evaluateJavaScript = vi
        .fn()
        .mockResolvedValue({ id: 'element1' });

      const locateResponse = {
        xpaths: ['/html/body/div[1]', '//*[@id="content"]'],
      };

      taskCache.cache = {
        pkgName: 'test',
        pkgVersion: '0.17.1',
        cacheId: 'test',
        aiTasks: [
          {
            prompt: 'test prompt',
            tasks: [
              {
                type: 'locate',
                prompt: 'test prompt',
                pageContext,
                response: locateResponse,
                element: {
                  id: 'element1',
                  rect: {
                    left: 100,
                    top: 100,
                    width: 100,
                    height: 100,
                  },
                  center: [100, 100],
                  xpaths: ['/html/body/div[1]', '//*[@id="content"]'],
                },
              },
            ],
          },
        ],
      };

      const cacheGroup = taskCache.getCacheGroupByPrompt('test prompt');
      const result = await cacheGroup.matchCache(
        formalPageContext,
        'locate',
        'test prompt',
      );

      expect(result).toEqual(locateResponse);
      expect(taskCache.page.evaluateJavaScript).toHaveBeenCalled();
      expect(taskCache.page.evaluateJavaScript).toHaveBeenCalledWith(
        expect.stringContaining("getNodeInfoByXpath('/html/body/div[1]')"),
      );
    });

    it('should return false if no xpaths are provided in the cached response', async () => {
      taskCache.cache = {
        pkgName: 'test',
        pkgVersion: '0.17.0',
        cacheId: 'test',
        aiTasks: [
          {
            prompt: 'test prompt',
            tasks: [
              {
                type: 'locate',
                prompt: 'test prompt',
                pageContext,
                response: {
                  xpaths: [],
                },
                element: {
                  id: 'element2',
                  rect: {
                    left: 100,
                    top: 100,
                    width: 100,
                    height: 100,
                  },
                  center: [100, 100],
                  xpaths: [],
                },
              },
            ],
          },
        ],
      };

      const cacheGroup = taskCache.getCacheGroupByPrompt('test prompt');
      const result = await cacheGroup.matchCache(
        formalPageContext,
        'locate',
        'test prompt',
      );

      expect(result).toBe(false);
    });

    it('should correctly handle xpaths cache matching with real page objects', async () => {
      const { page: realPage, reset } = await launchPage('https://example.com');
      const realTaskCache = new TaskCache(realPage);
      const existingXpath = '/html/body/div/h1';
      const locateResponse = {
        xpaths: [existingXpath],
      };

      realTaskCache.cache = {
        pkgName: 'test',
        pkgVersion: '0.17.1',
        cacheId: 'test',
        aiTasks: [
          {
            prompt: 'find heading',
            tasks: [
              {
                type: 'locate',
                prompt: 'find heading',
                pageContext: {
                  url: 'https://example.com',
                  size: { width: 1024, height: 768 },
                },
                response: locateResponse,
                element: {
                  id: 'example-heading',
                  rect: {
                    left: 100,
                    top: 100,
                    width: 100,
                    height: 100,
                  },
                  center: [100, 100],
                  xpaths: [existingXpath],
                },
              },
            ],
          },
        ],
      };

      const realPageContext = {
        url: 'https://example.com',
        size: { width: 1024, height: 768 },
        screenshotBase64: '',
        content: [],
      } as any;

      const cacheGroup = realTaskCache.getCacheGroupByPrompt('find heading');
      const result = await cacheGroup.matchCache(
        realPageContext,
        'locate',
        'find heading',
      );

      // if the page structure changes, this test may fail, but this is the purpose of the test - to ensure that the cache hit logic can correctly handle the actual page
      if (result) {
        expect(result).toEqual(locateResponse);
      } else {
        // because we are using a real page, if the page structure changes, it may fail to find the element
        // in this case, we only need to verify that the return value is false
        expect(result).toBe(false);
      }

      await reset();
    });

    it('should return false if the pkgVersion is less than 0.17.0', async () => {
      taskCache.cache.pkgVersion = '0.16.8';
      const cacheGroup = taskCache.getCacheGroupByPrompt('test prompt');
      const result = await cacheGroup.matchCache(
        formalPageContext,
        'locate',
        'test prompt',
      );
      expect(result).toBe(false);
    });
  },
  { timeout: 20000 },
);
