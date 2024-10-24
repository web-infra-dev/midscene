import assert from 'node:assert';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type {
  BaseElement,
  DumpMeta,
  DumpSubscriber,
  ElementById,
  InsightDump,
  LiteUISection,
  PartialInsightDumpFromSDK,
  Rect,
  UIContext,
  UISection,
} from '@/types';
import {
  getLogDir,
  insightDumpFileExt,
  stringifyDumpData,
  writeLogFile,
} from '@/utils';
import { getMidscenePkgInfo } from '@midscene/shared/fs';

let logFileName = '';
const logContent: string[] = [];
const logIdIndexMap: Record<string, number> = {};
const { pid } = process;
const logFileExt = insightDumpFileExt;

/**
 * Writes an insight dump to a log file with error handling.
 * @param {PartialInsightDumpFromSDK} data - The data to be logged.
 * @param {string} [logId] - Optional log ID.
 * @param {DumpSubscriber} [dumpSubscriber] - Optional dump subscriber callback.
 * @returns {string} - The ID of the logged dump.
 */
export function writeInsightDump(
  data: PartialInsightDumpFromSDK,
  logId?: string,
  dumpSubscriber?: DumpSubscriber,
): string {
  const logDir = getLogDir();
  if (!logDir) throw new Error('logDir should be set before writing dump file');

  const id = logId || randomUUID();
  const baseData: DumpMeta = {
    sdkVersion: getMidscenePkgInfo(__dirname)?.version ?? 'unknown',
    logTime: Date.now(),
  };
  const finalData: InsightDump = {
    logId: id,
    ...baseData,
    ...data,
  };

  dumpSubscriber?.(finalData);

  if (!logFileName) {
    logFileName = `pid_${pid}_${baseData.logTime}`;
    while (existsSync(join(logDir, `${logFileName}.${logFileExt}`))) {
      logFileName = `${pid}_${baseData.logTime}-${Math.random()}`;
    }
  }

  try {
    const dataString = stringifyDumpData(finalData, 2);
    if (logIdIndexMap[id] !== undefined) {
      logContent[logIdIndexMap[id]] = dataString;
    } else {
      const length = logContent.push(dataString);
      logIdIndexMap[id] = length - 1;
    }
    writeLogFile({
      fileName: logFileName,
      fileExt: logFileExt,
      fileContent: `[\n${logContent.join(',\n')}\n]`,
      type: 'dump',
    });
  } catch (error) {
    console.error(`Error writing log file: ${error.message}`, error);
    throw new Error('Failed to write log file');
  }

  return id;
}

/**
 * Converts a list of IDs into an array of elements by retrieving them.
 * Adds error logging if an element is not found.
 * @param {string[]} ids - The list of IDs.
 * @param {ElementById} elementById - Function to retrieve an element by ID.
 * @returns {BaseElement[]} - The array of elements.
 */
export function idsIntoElements(
  ids: string[],
  elementById: ElementById,
): BaseElement[] {
  return ids.reduce<BaseElement[]>((acc, id) => {
    try {
      const element = elementById(id);
      if (element) {
        acc.push(element);
      } else {
        console.warn(`element not found by id: ${id}`);
      }
    } catch (error) {
      console.error(`Error retrieving element by id: ${id}`, error);
    }
    return acc;
  }, []);
}

/**
 * Expands ids in an object to corresponding elements, with improved type safety.
 * @param {DataScheme} data - The object to expand.
 * @param {(id: string) => boolean} ifMeet - Condition to check if an ID should be expanded.
 * @param {(id: string) => BaseElement | BaseElement[] | null} elementsById - Function to retrieve element(s) by ID.
 * @returns {DataScheme} - The modified object with expanded IDs.
 */
export function shallowExpandIds<DataScheme extends object = {}>(
  data: DataScheme,
  ifMeet: (id: string) => boolean,
  elementsById: (id: string) => BaseElement | BaseElement[] | null,
): DataScheme {
  const keys = Object.keys(data);
  keys.forEach((key) => {
    const value = (data as any)[key];
    if (typeof value === 'string' && ifMeet(value)) {
      (data as any)[key] = elementsById(value);
    } else if (Array.isArray(value)) {
      const newValue = value.map((id) => (ifMeet(id) ? elementsById(id) : id));
      (data as any)[key] = newValue;
    }
  });

  return data;
}

/**
 * Expands a LiteUISection into a full UISection by calculating its bounding box and resolving text elements.
 * @param {LiteUISection} liteSection - The lite section to expand.
 * @param {ElementById} elementById - Function to retrieve element by ID.
 * @returns {UISection} - The expanded section.
 */
export function expandLiteSection(
  liteSection: LiteUISection,
  elementById: ElementById,
): UISection {
  const { textIds, ...remainingFields } = liteSection;

  const texts: BaseElement[] = idsIntoElements(textIds, elementById);

  // Calculate the bounding box of the section
  const sectionRect = calculateBoundingBox(texts);

  return {
    ...remainingFields,
    content: texts,
    rect: sectionRect,
  };
}

/**
 * Calculates the bounding box for a list of elements.
 * @param {BaseElement[]} elements - The list of elements.
 * @returns {Rect} - The bounding box.
 */
function calculateBoundingBox(elements: BaseElement[]): Rect {
  let leftMost = -1;
  let topMost = -1;
  let rightMost = -1;
  let bottomMost = -1;

  elements.forEach((el) => {
    leftMost = leftMost === -1 ? el.rect.left : Math.min(leftMost, el.rect.left);
    topMost = topMost === -1 ? el.rect.top : Math.min(topMost, el.rect.top);
    rightMost = Math.max(rightMost, el.rect.left + el.rect.width);
    bottomMost = Math.max(bottomMost, el.rect.top + el.rect.height);
  });

  return {
    left: leftMost,
    top: topMost,
    width: rightMost - leftMost,
    height: bottomMost - topMost,
  };
}

/**
 * A fake parser that collects all text into a single section for debugging purposes.
 * @param {UIContext} context - The UI context.
 * @returns {Promise<Record<string, UISection>>} - A fake parsed result.
 */
export async function fakeParserCollectsTexts<P>(
  context: UIContext,
): Promise<Record<string, UISection>> {
  const { content } = context;
  const section: UISection = {
    name: 'all-texts',
    description: 'all texts in the page',
    sectionCharacteristics: 'all texts',
    content,
    rect: {
      left: 0,
      top: 0,
      width: context.size.width,
      height: context.size.height,
    },
  };

  return { 'all-texts': section } as any;
}
