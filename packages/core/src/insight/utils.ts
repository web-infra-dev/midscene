import type { DumpMeta, InsightDump, PartialInsightDumpFromSDK } from '@/types';
import { uuid } from '@midscene/shared/utils';

export function createInsightDump(
  data: PartialInsightDumpFromSDK,
): InsightDump {
  const baseData: DumpMeta = {
    logTime: Date.now(),
  };
  const finalData: InsightDump = {
    logId: uuid(),
    ...baseData,
    ...data,
  };

  return finalData;
}
