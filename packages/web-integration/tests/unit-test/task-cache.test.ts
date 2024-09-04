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

// describe('File operations', () => {
//   beforeEach(() => {
//     vi.resetAllMocks();
//     vi.mocked(utils.getLogDirByType).mockReturnValue('/mock/cache/dir');
//     vi.mocked(utils.getPkgInfo).mockReturnValue({
//       name: 'test-pkg',
//       version: '1.0.0',
//       dir: '/mock',
//     });
//     vi.mocked(path.join).mockImplementation((...args) => args.join('/'));
//   });

//   it('should write cache to file', () => {
//     const mockWriteLogFile = vi.mocked(utils.writeLogFile);
//     const mockStringifyDumpData = vi
//       .mocked(utils.stringifyDumpData)
//       .mockReturnValue('{"mocked":"data"}');

//     const taskCacheJson = { aiTasks: [] };
//     taskCache.cacheId = 'test-cache-id';
//     taskCache.writeCacheToFile(taskCacheJson);

//     expect(mockWriteLogFile).toHaveBeenCalledWith({
//       fileName: 'test-cache-id',
//       fileExt: 'json',
//       fileContent: '{"mocked":"data"}',
//       type: 'cache',
//     });

//     expect(mockStringifyDumpData).toHaveBeenCalledWith(
//       expect.objectContaining({
//         pkgName: 'test-pkg',
//         pkgVersion: '1.0.0',
//         cacheId: 'test-cache-id',
//         aiTasks: [],
//       }),
//       2,
//     );
//   });

//   it('should read cache from file when it exists', () => {
//     vi.mocked(fs.existsSync).mockReturnValue(true);
//     vi.mocked(fs.readFileSync).mockReturnValue(
//       JSON.stringify({
//         pkgName: 'test-pkg',
//         pkgVersion: '1.0.0',
//         aiTasks: [{ type: 'plan', prompt: 'test prompt' }],
//       }),
//     );

//     process.env.MIDSCENE_CACHE = 'true';
//     taskCache.cacheId = 'test-cache-id';

//     const result = taskCache.readCacheFromFile();

//     expect(result).toEqual({
//       pkgName: 'test-pkg',
//       pkgVersion: '1.0.0',
//       aiTasks: [{ type: 'plan', prompt: 'test prompt' }],
//     });

//     expect(fs.existsSync).toHaveBeenCalledWith(
//       '/mock/cache/dir/test-cache-id.json',
//     );
//     expect(fs.readFileSync).toHaveBeenCalledWith(
//       '/mock/cache/dir/test-cache-id.json',
//       'utf8',
//     );
//   });

//   it('should return undefined when cache file does not exist', () => {
//     vi.mocked(fs.existsSync).mockReturnValue(false);

//     process.env.MIDSCENE_CACHE = 'true';
//     taskCache.cacheId = 'test-cache-id';

//     const result = taskCache.readCacheFromFile();

//     expect(result).toBeUndefined();
//   });

//   it('should return undefined when package info does not match', () => {
//     vi.mocked(fs.existsSync).mockReturnValue(true);
//     vi.mocked(fs.readFileSync).mockReturnValue(
//       JSON.stringify({
//         pkgName: 'different-pkg',
//         pkgVersion: '2.0.0',
//         aiTasks: [],
//       }),
//     );

//     process.env.MIDSCENE_CACHE = 'true';
//     taskCache.cacheId = 'test-cache-id';

//     const result = taskCache.readCacheFromFile();

//     expect(result).toBeUndefined();
//   });
// });
