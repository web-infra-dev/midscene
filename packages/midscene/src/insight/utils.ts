import assert from 'node:assert';
import { randomUUID } from 'node:crypto';
/* eslint-disable @typescript-eslint/ban-types */
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { MIDSCENE_MODEL_NAME, getAIConfig } from '@/env';
import type {
  BaseElement,
  DumpMeta,
  DumpSubscriber,
  ElementById,
  InsightDump,
  PartialInsightDumpFromSDK,
} from '@/types';
import {
  getLogDir,
  getVersion,
  insightDumpFileExt,
  stringifyDumpData,
  writeLogFile,
} from '@/utils';
import { uuid } from '@midscene/shared/utils';
let logFileName = '';
const logContent: string[] = [];
const logIdIndexMap: Record<string, number> = {};
const { pid } = process;
const logFileExt = insightDumpFileExt;
const ifInBrowser = typeof window !== 'undefined';

export function writeInsightDump(
  data: PartialInsightDumpFromSDK,
  logId?: string,
  dumpSubscriber?: DumpSubscriber,
): string {
  const logDir = getLogDir();
  assert(logDir, 'logDir should be set before writing dump file');

  const id = logId || uuid();
  const baseData: DumpMeta = {
    sdkVersion: getVersion(),
    logTime: Date.now(),
    model_name: getAIConfig(MIDSCENE_MODEL_NAME) || '',
  };
  const finalData: InsightDump = {
    logId: id,
    ...baseData,
    ...data,
  };

  dumpSubscriber?.(finalData);

  const dataString = stringifyDumpData(finalData, 2);

  if (typeof logIdIndexMap[id] === 'number') {
    logContent[logIdIndexMap[id]] = dataString;
  } else {
    const length = logContent.push(dataString);
    logIdIndexMap[id] = length - 1;
  }

  if (!ifInBrowser) {
    if (!logFileName) {
      logFileName = `pid_${pid}_${baseData.logTime}`;
      while (existsSync(join(logDir, `${logFileName}.${logFileExt}`))) {
        logFileName = `${pid}_${baseData.logTime}-${Math.random()}`;
      }
    }

    writeLogFile({
      fileName: logFileName,
      fileExt: logFileExt,
      fileContent: `[\n${logContent.join(',\n')}\n]`,
      type: 'dump',
    });
  }

  return id;
}
