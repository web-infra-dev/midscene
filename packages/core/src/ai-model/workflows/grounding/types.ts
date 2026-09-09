import type { AIUsageInfo, Rect, UIContext } from '@/types';
import type { LocateResultElement } from '@midscene/shared/types';
import type { TUserPrompt } from '../../../common';
import type { ModelRuntime } from '../../models';
import type { PixelLocateResult } from '../../shared/model-locate-result';

/** Maps coordinates from a prepared search-area image back to the screenshot. */
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
  disableGroundingGuidance?: boolean;
  modelRuntime: ModelRuntime;
  abortSignal?: AbortSignal;
}

export interface LocateRequest {
  targetElementDescription: TUserPrompt;
  locateImage: {
    imageBase64: string;
    width: number;
    height: number;
  };
  options: LocateOptions;
}

export interface LocateResult {
  parseResult: {
    element?: LocateResultElement;
    errors?: string[];
  };
  rawResponse: string;
  rawChoiceMessage?: unknown;
  usage?: AIUsageInfo;
  reasoning_content?: string;
}

export interface LocateModelResponse {
  /** Target center and optional original bbox in locate-image pixels, before crop mapping. */
  locatedPixelResult?: PixelLocateResult;
  rawResponse: string;
  rawChoiceMessage?: unknown;
  usage?: AIUsageInfo;
  reasoningContent?: string;
  errors?: string[];
}

export type LocateFn = (
  locateRequest: LocateRequest,
) => Promise<LocateModelResponse>;
