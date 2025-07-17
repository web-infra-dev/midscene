import type { StaticPage } from '@/playground';
import type {
  BaseElement,
  ElementTreeNode,
  ExecutionDump,
  ExecutionTask,
  PlanningLocateParam,
  PlaywrightParserOpt,
  UIContext,
} from '@midscene/core';
import { elementByPositionWithElementInfo } from '@midscene/core/ai-model';
import { uploadTestInfoToServer } from '@midscene/core/utils';
import { MIDSCENE_REPORT_TAG_NAME, getAIConfig } from '@midscene/shared/env';
import type { ElementInfo } from '@midscene/shared/extractor';
import {
  generateElementByPosition,
  getNodeFromCacheList,
  traverseTree,
} from '@midscene/shared/extractor';
import { resizeImgBase64 } from '@midscene/shared/img';
import type { DebugFunction } from '@midscene/shared/logger';
import { assert, logMsg, uuid } from '@midscene/shared/utils';
import dayjs from 'dayjs';
import type { Page as PlaywrightPage } from 'playwright';
import type { Page as PuppeteerPage } from 'puppeteer';
import { WebElementInfo } from '../web-element';
import type { WebPage } from './page';
import { debug as cacheDebug } from './task-cache';
import type { PageTaskExecutor } from './tasks';

export type WebUIContext = UIContext<WebElementInfo> & {
  url: string;
};

export async function parseContextFromWebPage(
  page: WebPage,
  _opt?: PlaywrightParserOpt,
): Promise<WebUIContext> {
  assert(page, 'page is required');
  if ((page as StaticPage)._forceUsePageContext) {
    return await (page as any)._forceUsePageContext();
  }
  const url = await page.url();
  uploadTestInfoToServer({ testUrl: url });

  let screenshotBase64: string;
  let tree: ElementTreeNode<ElementInfo>;

  await Promise.all([
    page.screenshotBase64().then((base64) => {
      screenshotBase64 = base64;
    }),
    page.getElementsNodeTree().then(async (treeRoot) => {
      tree = treeRoot;
    }),
  ]);

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

  assert(screenshotBase64!, 'screenshotBase64 is required');

  const size = await page.size();

  if (size.dpr && size.dpr > 1) {
    // console.time('resizeImgBase64');
    screenshotBase64 = await resizeImgBase64(screenshotBase64, {
      width: size.width,
      height: size.height,
    });
    // console.timeEnd('resizeImgBase64');
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
  debug: DebugFunction,
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
        debug(`failed to close popup ${url}, error: ${error}`);
      }
    } else {
      debug(`popup is already closed, skip close ${url}`);
    }

    if (!page.isClosed()) {
      try {
        await page.goto(url);
      } catch (error) {
        debug(`failed to goto ${url}, error: ${error}`);
      }
    } else {
      debug(`page is already closed, skip goto ${url}`);
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
  cachePrompt: string,
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
