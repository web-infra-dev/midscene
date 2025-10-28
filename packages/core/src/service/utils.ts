import type { DumpMeta, PartialServiceDumpFromSDK, ServiceDump } from '@/types';
import { uuid } from '@midscene/shared/utils';

export function createServiceDump(
  data: PartialServiceDumpFromSDK,
): ServiceDump {
  const baseData: DumpMeta = {
    logTime: Date.now(),
  };
  const finalData: ServiceDump = {
    logId: uuid(),
    ...baseData,
    ...data,
  };

  return finalData;
}
