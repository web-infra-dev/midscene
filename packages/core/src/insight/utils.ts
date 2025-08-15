import type {
  DumpMeta,
  DumpSubscriber,
  InsightDump,
  PartialInsightDumpFromSDK,
} from '@/types';
import { getVersion } from '@/utils';
import { type IModelPreferences, getUsedModelName } from '@midscene/shared/env';
import { uuid } from '@midscene/shared/utils';

export function emitInsightDump(
  data: PartialInsightDumpFromSDK,
  modelPreference: IModelPreferences,
  dumpSubscriber?: DumpSubscriber,
) {
  const baseData: DumpMeta = {
    sdkVersion: getVersion(),
    logTime: Date.now(),
    model_name: getUsedModelName(modelPreference) || '',
  };
  const finalData: InsightDump = {
    logId: uuid(),
    ...baseData,
    ...data,
  };

  dumpSubscriber?.(finalData);
}
