import type {
  DumpMeta,
  DumpSubscriber,
  InsightDump,
  PartialInsightDumpFromSDK,
} from '@/types';
import { getVersion } from '@/utils';
import {
  MIDSCENE_MODEL_NAME,
  getAIConfig,
  uiTarsModelVersion,
  vlLocateMode,
} from '@midscene/shared/env';
import { uuid } from '@midscene/shared/utils';

export function emitInsightDump(
  data: PartialInsightDumpFromSDK,
  dumpSubscriber?: DumpSubscriber,
) {
  let modelDescription = '';

  if (vlLocateMode()) {
    const uiTarsModelVer = uiTarsModelVersion();
    if (uiTarsModelVer) {
      modelDescription = `UI-TARS=${uiTarsModelVer}`;
    } else {
      modelDescription = `${vlLocateMode()} mode`;
    }
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
