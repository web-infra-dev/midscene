import { type LocateTask, type PlanTask, TaskCache } from '@/common/task-cache';
import type { WebUIContext } from '@/common/utils';
import type { WebElementInfo } from '@/web-element';
import type { AIElementParseResponse } from '@midscene/core';
import { beforeEach, describe, expect, it } from 'vitest';

describe('TaskCache', () => {
  let taskCache: TaskCache;
  let formalPageContext: WebUIContext;
  let pageContext: LocateTask['pageContext'];

  beforeEach(() => {
    taskCache = new TaskCache();
    pageContext = {
      url: 'https://example.com',
      size: { width: 1024, height: 768 },
    };
    formalPageContext = {
      ...pageContext,
      screenshotBase64: '',
      content: [{ id: 'element1' } as WebElementInfo], // 示例页面内容
    };
  });

  it('should return false if no cache is available', async () => {
    const cacheGroup = taskCache.getCacheGroupByPrompt('test prompt');
    const result = cacheGroup.readCache(
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
            response: { plans: [] },
          },
        ],
      },
    ];
    const cacheGroup = taskCache.getCacheGroupByPrompt('test prompt');
    const result = cacheGroup.readCache(
      formalPageContext,
      'plan',
      'test prompt',
    );
    expect(result).toBe(false);
  });

  it('should return false if the element cannot be found in the new context', async () => {
    taskCache.cache = {
      aiTasks: [
        {
          prompt: 'test prompt',
          tasks: [
            {
              type: 'locate',
              prompt: 'test prompt',
              pageContext,
              response: {
                elements: [{ id: 'element3' }],
              } as AIElementParseResponse,
            },
          ],
        },
      ],
    };
    const cacheGroup = taskCache.getCacheGroupByPrompt('test prompt');
    const result = cacheGroup.readCache(
      formalPageContext,
      'locate',
      'test prompt',
    );
    expect(result).toBe(false);
  });

  it('should return cached response if the conditions match', async () => {
    const cachedResponse = {
      plans: [{ type: 'Locate', thought: '', param: {} }],
    } as PlanTask['response'];
    taskCache.cache = {
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
    const result = cacheGroup.readCache(
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
      response: { plans: [{ type: 'Locate', thought: '', param: {} }] },
    };
    cacheGroup.saveCache(newCache);
    expect(taskCache.newCache.aiTasks[0].tasks).toContain(newCache);
  });

  it('should check page context equality correctly', () => {
    const isEqual = taskCache.pageContextEqual(pageContext, formalPageContext);
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
});
