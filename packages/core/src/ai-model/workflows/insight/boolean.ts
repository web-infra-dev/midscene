import type { AIUsageInfo } from '@/types';
import type { ExtractOptions } from './extraction';

export type BooleanFn = (options: ExtractOptions) => Promise<{
  value: boolean;
  rawResponse: string;
  usage?: AIUsageInfo;
}>;
