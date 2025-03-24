import {
  MIDSCENE_MODEL_NAME,
  MIDSCENE_USE_VLM_UI_TARS,
  getAIConfig,
  getAIConfigInBoolean,
  vlLocateMode,
} from '@/env';
import type {
  DumpMeta,
  DumpSubscriber,
  InsightDump,
  PartialInsightDumpFromSDK,
} from '@/types';
import { getLogDir, getVersion, stringifyDumpData } from '@/utils';
import { assert } from '@midscene/shared/utils';
import { uuid } from '@midscene/shared/utils';

export function emitInsightDump(
  data: PartialInsightDumpFromSDK,
  dumpSubscriber?: DumpSubscriber,
) {
  const logDir = getLogDir();
  assert(logDir, 'logDir should be set before writing dump file');

  let modelDescription = '';
  if (getAIConfigInBoolean(MIDSCENE_USE_VLM_UI_TARS)) {
    modelDescription = 'vlm-ui-tars mode';
  } else if (vlLocateMode()) {
    modelDescription = `${vlLocateMode()} mode`;
  }

  const baseData: DumpMeta = {
    sdkVersion: getVersion(),
    logTime: Date.now(),
    model_name: getAIConfig(MIDSCENE_MODEL_NAME) || '',
    model_description: modelDescription,
  };
  const finalData: InsightDump = {
    logId: uuid(),
    ...baseData,
    ...data,
  };

  dumpSubscriber?.(finalData);
}
