import type {
  DumpMeta,
  DumpSubscriber,
  InsightDump,
  PartialInsightDumpFromSDK,
} from '@/types';
import { uuid } from '@midscene/shared/utils';

export function emitInsightDump(
  data: PartialInsightDumpFromSDK,
  dumpSubscriber?: DumpSubscriber,
) {
  const baseData: DumpMeta = {
    logTime: Date.now(),
  };
  const finalData: InsightDump = {
    logId: uuid(),
    ...baseData,
    ...data,
  };

  dumpSubscriber?.(finalData);
}
