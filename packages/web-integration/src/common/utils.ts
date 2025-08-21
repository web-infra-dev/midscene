import type { StaticPage } from '@/playground';
import type {
  BaseElement,
  DetailedLocateParam,
  DeviceAction,
  ElementTreeNode,
  ExecutionDump,
  ExecutionTask,
  ExecutorContext,
  LocateOption,
  MidsceneLocationResultType,
  PlanningLocateParam,
  PlaywrightParserOpt,
  TMultimodalPrompt,
  TUserPrompt,
  UIContext,
} from '@midscene/core';
import { getMidsceneLocationSchema, z } from '@midscene/core';
import { elementByPositionWithElementInfo } from '@midscene/core/ai-model';
import { sleep, uploadTestInfoToServer } from '@midscene/core/utils';
import { MIDSCENE_REPORT_TAG_NAME, getAIConfig } from '@midscene/shared/env';
import type { ElementInfo } from '@midscene/shared/extractor';
import {
  generateElementByPosition,
  getNodeFromCacheList,
  traverseTree,
} from '@midscene/shared/extractor';
import { resizeImgBase64 } from '@midscene/shared/img';
import { type DebugFunction, getDebug } from '@midscene/shared/logger';
import { assert, logMsg, uuid } from '@midscene/shared/utils';
import dayjs from 'dayjs';
import type { Page as PlaywrightPage } from 'playwright';
import type { Page as PuppeteerPage } from 'puppeteer';
import type { AbstractPage } from '../page';
import { WebElementInfo, type WebUIContext } from '../web-element';
import type { WebPage } from './page';
import { debug as cacheDebug } from './task-cache';
import type { PageTaskExecutor } from './tasks';
import { getKeyCommands } from './ui-utils';

const debugProfile = getDebug('web:tool:profile');
const debugUtils = getDebug('web:tool:utils');

export async function parseContextFromWebPage(
  page: WebPage,
  _opt?: PlaywrightParserOpt,
): Promise<WebUIContext> {
  assert(page, 'page is required');
  if ((page as StaticPage)._forceUsePageContext) {
    return await (page as any)._forceUsePageContext();
  }

  debugProfile('Getting page URL');
  const url = await page.url();
  debugProfile('URL end');

  debugProfile('Uploading test info to server');
  uploadTestInfoToServer({ testUrl: url });
  debugProfile('UploadTestInfoToServer end');

  let screenshotBase64: string;
  let tree: ElementTreeNode<ElementInfo>;

  debugProfile('Starting parallel operations: screenshot and element tree');
  await Promise.all([
    page.screenshotBase64().then((base64) => {
      screenshotBase64 = base64;
      debugProfile('ScreenshotBase64 end');
    }),
    page.getElementsNodeTree().then(async (treeRoot) => {
      tree = treeRoot;
      debugProfile('GetElementsNodeTree end');
    }),
  ]);
  debugProfile('ParseContextFromWebPage end');
  debugProfile('Traversing element tree');
  const webTree = traverseTree(tree!, (elementInfo) => {
    const { rect, id, content, attributes, indexId, isVisible } = elementInfo;
    return new WebElementInfo({
      rect,
      id,
      content,
      attributes,
      indexId,
      isVisible,
    });
  });
  debugProfile('TraverseTree end');
  assert(screenshotBase64!, 'screenshotBase64 is required');

  const size = await page.size();

  debugProfile(`size: ${size.width}x${size.height} dpr: ${size.dpr}`);

  if (size.dpr && size.dpr > 1) {
    debugProfile('Resizing screenshot for high DPR display');
    screenshotBase64 = await resizeImgBase64(screenshotBase64, {
      width: size.width,
      height: size.height,
    });
    debugProfile('ResizeImgBase64 end');
  }

  return {
    tree: webTree,
    size,
    screenshotBase64: screenshotBase64!,
    url,
  };
}

export function getReportFileName(tag = 'web') {
  const reportTagName = getAIConfig(MIDSCENE_REPORT_TAG_NAME);
  const dateTimeInFileName = dayjs().format('YYYY-MM-DD_HH-mm-ss');
  // ensure uniqueness at the same time
  const uniqueId = uuid().substring(0, 8);
  return `${reportTagName || tag}-${dateTimeInFileName}-${uniqueId}`;
}

export function printReportMsg(filepath: string) {
  logMsg(`Midscene - report file updated: ${filepath}`);
}

/**
 * Get the current execution file name
 * @returns The name of the current execution file
 */
export function getCurrentExecutionFile(trace?: string): string | false {
  const error = new Error();
  const stackTrace = trace || error.stack;
  const pkgDir = process.cwd() || '';
  if (stackTrace) {
    const stackLines = stackTrace.split('\n');
    for (const line of stackLines) {
      if (
        line.includes('.spec.') ||
        line.includes('.test.') ||
        line.includes('.ts') ||
        line.includes('.js')
      ) {
        const match = line.match(/(?:at\s+)?(.*?\.(?:spec|test)\.[jt]s)/);
        if (match?.[1]) {
          const targetFileName = match[1]
            .replace(pkgDir, '')
            .trim()
            .replace('at ', '');
          return targetFileName;
        }
      }
    }
  }
  return false;
}

const testFileIndex = new Map<string, number>();

export function generateCacheId(fileName?: string): string {
  let taskFile = fileName || getCurrentExecutionFile();
  if (!taskFile) {
    taskFile = uuid();
    console.warn(
      'Midscene - using random UUID for cache id. Cache may be invalid.',
    );
  }

  if (testFileIndex.has(taskFile)) {
    const currentIndex = testFileIndex.get(taskFile);
    if (currentIndex !== undefined) {
      testFileIndex.set(taskFile, currentIndex + 1);
    }
  } else {
    testFileIndex.set(taskFile, 1);
  }
  return `${taskFile}-${testFileIndex.get(taskFile)}`;
}

export const ERROR_CODE_NOT_IMPLEMENTED_AS_DESIGNED =
  'NOT_IMPLEMENTED_AS_DESIGNED';

export function replaceIllegalPathCharsAndSpace(str: string) {
  // Only replace characters that are illegal in filenames, but preserve path separators
  return str.replace(/[:*?"<>| ]/g, '-');
}

export function forceClosePopup(
  page: PuppeteerPage | PlaywrightPage,
  debugProfile: DebugFunction,
) {
  page.on('popup', async (popup) => {
    if (!popup) {
      console.warn('got a popup event, but the popup is not ready yet, skip');
      return;
    }
    const url = await (popup as PuppeteerPage).url();
    console.log(`Popup opened: ${url}`);
    if (!(popup as PuppeteerPage).isClosed()) {
      try {
        await (popup as PuppeteerPage).close(); // Close the newly opened TAB
      } catch (error) {
        debugProfile(`failed to close popup ${url}, error: ${error}`);
      }
    } else {
      debugProfile(`popup is already closed, skip close ${url}`);
    }

    if (!page.isClosed()) {
      try {
        await page.goto(url);
      } catch (error) {
        debugProfile(`failed to goto ${url}, error: ${error}`);
      }
    } else {
      debugProfile(`page is already closed, skip goto ${url}`);
    }
  });
}

export function matchElementFromPlan(
  planLocateParam: PlanningLocateParam,
  tree: ElementTreeNode<BaseElement>,
) {
  if (!planLocateParam) {
    return undefined;
  }
  if (planLocateParam.id) {
    return getNodeFromCacheList(planLocateParam.id);
  }

  if (planLocateParam.bbox) {
    const centerPosition = {
      x: Math.floor((planLocateParam.bbox[0] + planLocateParam.bbox[2]) / 2),
      y: Math.floor((planLocateParam.bbox[1] + planLocateParam.bbox[3]) / 2),
    };
    let element = elementByPositionWithElementInfo(tree, centerPosition);

    if (!element) {
      element = generateElementByPosition(centerPosition) as BaseElement;
    }

    return element;
  }

  return undefined;
}

export async function matchElementFromCache(
  taskExecutor: PageTaskExecutor,
  xpaths: string[] | undefined,
  cachePrompt: TUserPrompt,
  cacheable: boolean | undefined,
) {
  try {
    if (
      xpaths?.length &&
      taskExecutor.taskCache?.isCacheResultUsed &&
      cacheable !== false
    ) {
      // hit cache, use new id
      for (let i = 0; i < xpaths.length; i++) {
        const element = await taskExecutor.page.getElementInfoByXpath(
          xpaths[i],
        );

        if (element?.id) {
          cacheDebug('cache hit, prompt: %s', cachePrompt);
          cacheDebug(
            'found a new element with same xpath, xpath: %s, id: %s',
            xpaths[i],
            element?.id,
          );
          return element;
        }
      }
    }
  } catch (error) {
    cacheDebug('get element info by xpath error: ', error);
  }
}

export function trimContextByViewport(execution: ExecutionDump) {
  function filterVisibleTree(
    node: ElementTreeNode<BaseElement>,
  ): ElementTreeNode<BaseElement> | null {
    if (!node) return null;

    // recursively process all children
    const filteredChildren = Array.isArray(node.children)
      ? (node.children
          .map(filterVisibleTree)
          .filter((child) => child !== null) as ElementTreeNode<BaseElement>[])
      : [];

    // if the current node is visible, keep it and the filtered children
    if (node.node && node.node.isVisible === true) {
      return {
        ...node,
        children: filteredChildren,
      };
    }

    // if the current node is invisible, but has visible children, create an empty node to include these children
    if (filteredChildren.length > 0) {
      return {
        node: null,
        children: filteredChildren,
      };
    }

    // if the current node is invisible and has no visible children, return null
    return null;
  }

  return {
    ...execution,
    tasks: Array.isArray(execution.tasks)
      ? execution.tasks.map((task: ExecutionTask) => {
          const newTask = { ...task };
          if (task.pageContext?.tree) {
            newTask.pageContext = {
              ...task.pageContext,
              tree: filterVisibleTree(task.pageContext.tree) || {
                node: null,
                children: [],
              },
            };
          }
          return newTask;
        })
      : execution.tasks,
  };
}

declare const __VERSION__: string | undefined;

export function buildDetailedLocateParam(
  locatePrompt: TUserPrompt,
  opt?: LocateOption,
): DetailedLocateParam | undefined {
  debugUtils('will call buildDetailedLocateParam', locatePrompt, opt);
  let prompt = locatePrompt || opt?.prompt || (opt as any)?.locate; // as a shortcut
  let deepThink = false;
  let cacheable = true;
  let xpath = undefined;

  if (typeof opt === 'object' && opt !== null) {
    deepThink = opt.deepThink ?? false;
    cacheable = opt.cacheable ?? true;
    xpath = opt.xpath;
    if (locatePrompt && opt.prompt && locatePrompt !== opt.prompt) {
      console.warn(
        'conflict prompt for item',
        locatePrompt,
        opt,
        'maybe you put the prompt in the wrong place',
      );
    }
    prompt = prompt || opt.prompt;
  }

  if (!prompt) {
    debugUtils(
      'no prompt, will return undefined in buildDetailedLocateParam',
      opt,
    );
    return undefined;
  }

  return {
    prompt,
    deepThink,
    cacheable,
    xpath,
  };
}

export function buildDetailedLocateParamAndRestParams(
  locatePrompt: TUserPrompt,
  opt: LocateOption | undefined,
  excludeKeys: string[] = [],
): {
  locateParam: DetailedLocateParam | undefined;
  restParams: Record<string, any>;
} {
  const locateParam = buildDetailedLocateParam(locatePrompt, opt);

  // Extract all keys from opt except the ones already included in locateParam
  const restParams: Record<string, any> = {};

  if (typeof opt === 'object' && opt !== null) {
    // Get all keys from opt
    const allKeys = Object.keys(opt);

    // Keys already included in locateParam: prompt, deepThink, cacheable, xpath
    const locateParamKeys = Object.keys(locateParam || {});

    // Extract all other keys
    for (const key of allKeys) {
      if (
        !locateParamKeys.includes(key) &&
        !excludeKeys.includes(key) &&
        key !== 'locate'
      ) {
        restParams[key] = opt[key as keyof LocateOption];
      }
    }
  }

  return {
    locateParam,
    restParams,
  };
}

export const getMidsceneVersion = (): string => {
  if (typeof __VERSION__ !== 'undefined') {
    return __VERSION__;
  } else if (
    process.env.__VERSION__ &&
    process.env.__VERSION__ !== 'undefined'
  ) {
    return process.env.__VERSION__;
  }
  throw new Error('__VERSION__ inject failed during build');
};

export const parsePrompt = (
  prompt: TUserPrompt,
): {
  textPrompt: string;
  multimodalPrompt?: TMultimodalPrompt;
} => {
  if (typeof prompt === 'string') {
    return {
      textPrompt: prompt,
      multimodalPrompt: undefined,
    };
  }
  return {
    textPrompt: prompt.prompt,
    multimodalPrompt: prompt.images
      ? {
          images: prompt.images,
          convertHttpImage2Base64: !!prompt.convertHttpImage2Base64,
        }
      : undefined,
  };
};

export const commonWebActionsForWebPage = <T extends AbstractPage>(
  page: T,
): DeviceAction<any>[] => [
  {
    name: 'Tap',
    description: 'Tap the element',
    interfaceAlias: 'aiTap',
    paramSchema: z.object({
      locate: getMidsceneLocationSchema().describe('The element to be tapped'),
    }),
    call: async (param) => {
      const element = param.locate;
      assert(element, 'Element not found, cannot tap');
      await page.mouse.click(element.center[0], element.center[1], {
        button: 'left',
      });
    },
  } as DeviceAction<{
    locate: MidsceneLocationResultType;
  }>,
  {
    name: 'RightClick',
    description: 'Right click the element',
    paramSchema: z.object({
      locate: getMidsceneLocationSchema().describe(
        'The element to be right clicked',
      ),
    }),
    call: async (param) => {
      const element = param.locate;
      assert(element, 'Element not found, cannot right click');
      await page.mouse.click(element.center[0], element.center[1], {
        button: 'right',
      });
    },
  } as DeviceAction<{
    locate: MidsceneLocationResultType;
  }>,
  {
    name: 'Hover',
    description: 'Move the mouse to the element',
    interfaceAlias: 'aiHover',
    paramSchema: z.object({
      locate: getMidsceneLocationSchema().describe('The element to be hovered'),
    }),
    call: async (param) => {
      const element = param.locate;
      assert(element, 'Element not found, cannot hover');
      await page.mouse.move(element.center[0], element.center[1]);
    },
  } as DeviceAction<{
    locate: MidsceneLocationResultType;
  }>,
  {
    name: 'Input',
    description:
      'Replace the input field with a new value. `value` is the final that should be filled in the input box. No matter what modifications are required, just provide the final value to replace the existing input value. Giving a blank string means clear the input field.',
    interfaceAlias: 'aiInput',
    paramSchema: z.object({
      value: z
        .string()
        .describe('The final value that should be filled in the input box'),
      locate: getMidsceneLocationSchema().describe(
        'The input field to be filled',
      ),
    }),
    call: async (param) => {
      const element = param.locate;
      if (element) {
        await page.clearInput(element as unknown as ElementInfo);

        if (!param || !param.value) {
          return;
        }
      }

      // Note: there is another implementation in AndroidDevicePage, which is more complex
      await page.keyboard.type(param.value);
    },
  } as DeviceAction<{
    value: string;
    locate: MidsceneLocationResultType;
  }>,
  {
    name: 'KeyboardPress',
    description: 'Press a key',
    interfaceAlias: 'aiKeyboardPress',
    paramSchema: z.object({
      locate: getMidsceneLocationSchema()
        .describe('The element to be clicked before pressing the key')
        .optional(),
      keyName: z.string().describe('The key to be pressed'),
    }),
    call: async (param, context) => {
      const element = param.locate;
      if (element) {
        await page.mouse.click(element.center[0], element.center[1], {
          button: 'left',
        });
      }

      const keys = getKeyCommands(param.keyName);
      await page.keyboard.press(keys as any); // TODO: fix this type error
    },
  } as DeviceAction<{
    keyName: string;
    locate: MidsceneLocationResultType;
  }>,
  {
    name: 'Scroll',
    description:
      'Scroll the page or an element. The direction to scroll, the scroll type, and the distance to scroll. The distance is the number of pixels to scroll. If not specified, use `down` direction, `once` scroll type, and `null` distance.',
    interfaceAlias: 'aiScroll',
    paramSchema: z.object({
      direction: z
        .enum(['down', 'up', 'right', 'left'])
        .default('down')
        .describe('The direction to scroll'),
      scrollType: z
        .enum(['once', 'untilBottom', 'untilTop', 'untilRight', 'untilLeft'])
        .default('once')
        .describe('The scroll type'),
      distance: z
        .number()
        .nullable()
        .optional()
        .describe('The distance in pixels to scroll'),
      locate: getMidsceneLocationSchema()
        .optional()
        .describe('The element to be scrolled'),
    }),
    call: async (param) => {
      const element = param.locate;
      const startingPoint = element
        ? {
            left: element.center[0],
            top: element.center[1],
          }
        : undefined;
      const scrollToEventName = param?.scrollType;
      if (scrollToEventName === 'untilTop') {
        await page.scrollUntilTop(startingPoint);
      } else if (scrollToEventName === 'untilBottom') {
        await page.scrollUntilBottom(startingPoint);
      } else if (scrollToEventName === 'untilRight') {
        await page.scrollUntilRight(startingPoint);
      } else if (scrollToEventName === 'untilLeft') {
        await page.scrollUntilLeft(startingPoint);
      } else if (scrollToEventName === 'once' || !scrollToEventName) {
        if (param?.direction === 'down' || !param || !param.direction) {
          await page.scrollDown(param?.distance || undefined, startingPoint);
        } else if (param.direction === 'up') {
          await page.scrollUp(param.distance || undefined, startingPoint);
        } else if (param.direction === 'left') {
          await page.scrollLeft(param.distance || undefined, startingPoint);
        } else if (param.direction === 'right') {
          await page.scrollRight(param.distance || undefined, startingPoint);
        } else {
          throw new Error(`Unknown scroll direction: ${param.direction}`);
        }
        // until mouse event is done
        await sleep(500);
      } else {
        throw new Error(
          `Unknown scroll event type: ${scrollToEventName}, param: ${JSON.stringify(
            param,
          )}`,
        );
      }
    },
  } as DeviceAction<{
    scrollType:
      | 'once'
      | 'untilBottom'
      | 'untilTop'
      | 'untilRight'
      | 'untilLeft';
    direction: 'up' | 'down';
    distance?: number;
    duration?: number;
    locate: MidsceneLocationResultType;
  }>,
  {
    name: 'DragAndDrop',
    description: 'Drag and drop the element',
    paramSchema: z.object({
      from: getMidsceneLocationSchema().describe('The position to be dragged'),
      to: getMidsceneLocationSchema().describe('The position to be dropped'),
    }),
    call: async (param) => {
      const from = param.from;
      const to = param.to;
      assert(from, 'missing "from" param for drag and drop');
      assert(to, 'missing "to" param for drag and drop');
      await page.mouse.drag(
        {
          x: from.center[0],
          y: from.center[1],
        },
        {
          x: to.center[0],
          y: to.center[1],
        },
      );
    },
  } as DeviceAction<{
    from: MidsceneLocationResultType;
    to: MidsceneLocationResultType;
  }>,
];
