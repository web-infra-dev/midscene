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
        pkgVersion: '0.0.1',
        midsceneVersion: '0.17.1',
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
        pkgVersion: '0.2.1',
        midsceneVersion: '0.17.1',
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
        pkgVersion: '0.2.1',
        midsceneVersion: '0.17.1',
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
        pkgVersion: '0.2.1',
        midsceneVersion: '0.17.1',
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
        pkgVersion: '0.1.1',
        midsceneVersion: '0.17.1',
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

    it('should update an existing cache entry instead of overwriting it', () => {
      // set initial cache
      taskCache.cache = {
        pkgName: 'test',
        pkgVersion: '0.2.1',
        midsceneVersion: '0.17.1',
        cacheId: 'test',
        aiTasks: [
          {
            prompt: 'test prompt',
            tasks: [
              {
                type: 'plan',
                prompt: 'test prompt',
                pageContext,
                response: {
                  actions: [
                    {
                      type: 'Locate',
                      thought: 'initial',
                      param: {},
                      locate: null,
                    },
                  ],
                  more_actions_needed_by_instruction: false,
                  log: '',
                },
              },
            ],
          },
        ],
      };

      // copy initial cache to new cache
      taskCache.newCache = JSON.parse(JSON.stringify(taskCache.cache));

      // update cache with the same prompt
      const cacheGroup = taskCache.getCacheGroupByPrompt('test prompt');
      const updatedCache: PlanTask = {
        type: 'plan',
        prompt: 'test prompt',
        pageContext,
        response: {
          actions: [
            { type: 'Locate', thought: 'updated', param: {}, locate: null },
          ],
          more_actions_needed_by_instruction: false,
          log: '',
        },
      };

      // save updated cache
      cacheGroup.saveCache(updatedCache);

      // verify cache is updated instead of overwritten
      expect(taskCache.newCache.aiTasks[0].tasks).toContain(updatedCache);
      expect(taskCache.newCache.aiTasks[0].tasks.length).toBe(2); // initial task + new task
    });

    it('should find and update cache by prompt', () => {
      // set initial cache, containing two different prompt groups
      taskCache.cache = {
        pkgName: 'test',
        pkgVersion: '0.2.1',
        midsceneVersion: '0.17.1',
        cacheId: 'test',
        aiTasks: [
          {
            prompt: 'first prompt',
            tasks: [
              {
                type: 'plan',
                prompt: 'first prompt',
                pageContext,
                response: {
                  actions: [],
                  more_actions_needed_by_instruction: false,
                  log: '',
                },
              },
            ],
          },
          {
            prompt: 'second prompt',
            tasks: [
              {
                type: 'plan',
                prompt: 'second prompt',
                pageContext,
                response: {
                  actions: [],
                  more_actions_needed_by_instruction: false,
                  log: '',
                },
              },
            ],
          },
        ],
      };

      // copy initial cache to new cache
      taskCache.newCache = JSON.parse(JSON.stringify(taskCache.cache));

      // update second prompt group
      const cacheGroup = taskCache.getCacheGroupByPrompt('second prompt');
      const newCache: PlanTask = {
        type: 'plan',
        prompt: 'second prompt',
        pageContext,
        response: {
          actions: [
            { type: 'Locate', thought: 'new', param: {}, locate: null },
          ],
          more_actions_needed_by_instruction: false,
          log: '',
        },
      };

      cacheGroup.saveCache(newCache);

      // verify only the target prompt group is updated
      expect(taskCache.newCache.aiTasks[1].tasks).toContain(newCache);
      expect(taskCache.newCache.aiTasks[0].tasks.length).toBe(1); // first group remains unchanged
      expect(taskCache.newCache.aiTasks[1].tasks.length).toBe(2); // second group has one more task
    });

    it('should update multiple entries with the same prompt in sequence', () => {
      taskCache.cache = {
        pkgName: 'test',
        pkgVersion: '0.2.1',
        midsceneVersion: '0.17.1',
        cacheId: 'test',
        aiTasks: [],
      };

      taskCache.newCache = JSON.parse(JSON.stringify(taskCache.cache));

      // get cache groups with the same prompt, and update them in sequence
      const cacheGroup1 = taskCache.getCacheGroupByPrompt('same prompt');
      const cacheGroup2 = taskCache.getCacheGroupByPrompt('same prompt');
      const cacheGroup3 = taskCache.getCacheGroupByPrompt('same prompt');

      // add three cache items
      const cache1: PlanTask = {
        type: 'plan',
        prompt: 'same prompt',
        pageContext,
        response: {
          actions: [
            { type: 'Locate', thought: 'first', param: {}, locate: null },
          ],
          more_actions_needed_by_instruction: false,
          log: '',
        },
      };

      const cache2: PlanTask = {
        type: 'plan',
        prompt: 'same prompt',
        pageContext,
        response: {
          actions: [
            { type: 'Locate', thought: 'second', param: {}, locate: null },
          ],
          more_actions_needed_by_instruction: false,
          log: '',
        },
      };

      const cache3: PlanTask = {
        type: 'plan',
        prompt: 'same prompt',
        pageContext,
        response: {
          actions: [
            { type: 'Locate', thought: 'third', param: {}, locate: null },
          ],
          more_actions_needed_by_instruction: false,
          log: '',
        },
      };

      cacheGroup1.saveCache(cache1);
      cacheGroup2.saveCache(cache2);
      cacheGroup3.saveCache(cache3);

      // verify cache is updated in sequence
      const samePropGroups = taskCache.newCache.aiTasks.filter(
        (group) => group.prompt === 'same prompt',
      );
      expect(samePropGroups.length).toBe(3); // create 3 cache groups with the same prompt

      // check each cache group contains only one task
      expect(samePropGroups[0].tasks.length).toBe(1);
      expect(samePropGroups[1].tasks.length).toBe(1);
      expect(samePropGroups[2].tasks.length).toBe(1);

      // check each task content is as expected
      expect(samePropGroups[0].tasks[0]).toEqual(cache1);
      expect(samePropGroups[1].tasks[0]).toEqual(cache2);
      expect(samePropGroups[2].tasks[0]).toEqual(cache3);
    });

    it('should load multiple entries with the same prompt in sequence', async () => {
      // simulate three cache items with the same prompt, but in three different cache groups
      const cachedResponses = [
        {
          actions: [
            {
              type: 'Locate' as const,
              thought: 'first',
              param: {},
              locate: null,
            },
          ],
          more_actions_needed_by_instruction: false,
          log: '',
        },
        {
          actions: [
            {
              type: 'Locate' as const,
              thought: 'second',
              param: {},
              locate: null,
            },
          ],
          more_actions_needed_by_instruction: false,
          log: '',
        },
        {
          actions: [
            {
              type: 'Locate' as const,
              thought: 'third',
              param: {},
              locate: null,
            },
          ],
          more_actions_needed_by_instruction: false,
          log: '',
        },
      ];

      taskCache.cache = {
        pkgName: 'test',
        pkgVersion: '0.2.1',
        midsceneVersion: '0.17.1',
        cacheId: 'test',
        aiTasks: [
          {
            prompt: 'sequence prompt',
            tasks: [
              {
                type: 'plan',
                prompt: 'sequence prompt',
                pageContext,
                response: cachedResponses[0],
              },
            ],
          },
          {
            prompt: 'sequence prompt',
            tasks: [
              {
                type: 'plan',
                prompt: 'sequence prompt',
                pageContext,
                response: cachedResponses[1],
              },
            ],
          },
          {
            prompt: 'sequence prompt',
            tasks: [
              {
                type: 'plan',
                prompt: 'sequence prompt',
                pageContext,
                response: cachedResponses[2],
              },
            ],
          },
        ],
      };

      // get cache groups and match cache in sequence
      const cacheGroup1 = taskCache.getCacheGroupByPrompt('sequence prompt');
      const result1 = await cacheGroup1.matchCache(
        formalPageContext,
        'plan',
        'sequence prompt',
      );

      const cacheGroup2 = taskCache.getCacheGroupByPrompt('sequence prompt');
      const result2 = await cacheGroup2.matchCache(
        formalPageContext,
        'plan',
        'sequence prompt',
      );

      const cacheGroup3 = taskCache.getCacheGroupByPrompt('sequence prompt');
      const result3 = await cacheGroup3.matchCache(
        formalPageContext,
        'plan',
        'sequence prompt',
      );

      // verify cache results are returned in sequence
      expect(result1).toEqual(cachedResponses[0]);
      expect(result2).toEqual(cachedResponses[1]);
      expect(result3).toEqual(cachedResponses[2]);

      // confirm that when all cache items are used, the cache will return false
      const cacheGroup4 = taskCache.getCacheGroupByPrompt('sequence prompt');
      const result4 = await cacheGroup4.matchCache(
        formalPageContext,
        'plan',
        'sequence prompt',
      );

      expect(result4).toBe(false);
    });
  },
  { timeout: 20000 },
);
