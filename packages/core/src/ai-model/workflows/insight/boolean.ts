import type {
  AIDataExtractionResponse,
  AIUsageInfo,
  RawAssistantOutput,
} from '@/types';
import { assert } from '@midscene/shared/utils';
import type { ExtractOptions } from './extraction';

export type BooleanFn = (options: ExtractOptions) => Promise<{
  value: boolean;
  rawResponse: string;
  usage?: AIUsageInfo;
}>;

export async function extractBoolean<T>(options: ExtractOptions): Promise<{
  parseResult: AIDataExtractionResponse<T>;
  rawResponse: string;
  usage?: AIUsageInfo;
  rawAssistantOutput?: RawAssistantOutput;
  reasoning_content?: string;
}> {
  const { booleanFn } = options.modelRuntime.adapter.insight;
  assert(booleanFn, 'A boolean adapter is required');
  const keys =
    typeof options.dataQuery === 'object' ? Object.keys(options.dataQuery) : [];
  assert(
    keys.length === 1,
    'Boolean insight tasks require exactly one result field.',
  );
  const result = await booleanFn(options);
  return {
    parseResult: {
      data: { [keys[0]]: result.value } as T,
    },
    rawResponse: result.rawResponse,
    usage: result.usage,
  };
}
