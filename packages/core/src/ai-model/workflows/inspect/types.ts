import type { AIUsageInfo, Rect, UIContext } from '@/types';
import type { IModelConfig } from '@midscene/shared/env';
import type { LocateResultElement } from '@midscene/shared/types';
import type { TUserPrompt } from '../../../common';

export interface SearchAreaImageMapping {
  offset: {
    x: number;
    y: number;
  };
  scale: number;
}

export interface SearchAreaConfig {
  rect: Rect;
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
  modelConfig: IModelConfig;
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
