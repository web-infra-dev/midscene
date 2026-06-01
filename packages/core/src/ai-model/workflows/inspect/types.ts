import type { AIUsageInfo, Rect, UIContext } from '@/types';
import type { LocateResultElement } from '@midscene/shared/types';
import type { TUserPrompt } from '../../../common';
import type { ModelRuntime } from '../../models';

export interface SearchAreaImageMapping {
  offset: {
    x: number;
    y: number;
  };
  scale: number;
}

export interface SearchAreaConfig {
  sourceRect: Rect;
  image: {
    imageBase64: string;
    width: number;
    height: number;
  };
  mapping: SearchAreaImageMapping;
}

export interface LocateOptions {
  context: UIContext;
  searchConfig?: SearchAreaConfig;
  modelRuntime: ModelRuntime;
  abortSignal?: AbortSignal;
}

export interface LocateResult {
  parseResult: {
    element?: LocateResultElement;
    errors?: string[];
  };
  rect?: Rect;
  rawResponse: string;
  usage?: AIUsageInfo;
  reasoning_content?: string;
}

export type LocateFn = (
  elementDescription: TUserPrompt,
  options: LocateOptions,
) => Promise<LocateResult>;
