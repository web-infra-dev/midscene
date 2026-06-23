import type { AIUsageInfo, PixelBbox, Rect, UIContext } from '@/types';
import type { LocateResultElement } from '@midscene/shared/types';
import type { ChatCompletionUserMessageParam } from 'openai/resources/index';
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

export interface LocateRequestContext {
  elementDescriptionText: string;
  locateImage: {
    imageBase64: string;
    width: number;
    height: number;
  };
  referenceImageMessages?: ChatCompletionUserMessageParam[];
  options: LocateOptions;
}

export interface LocateResult {
  parseResult: {
    element?: LocateResultElement;
    errors?: string[];
  };
  rect?: Rect;
  rawResponse: string;
  rawChoiceMessage?: unknown;
  usage?: AIUsageInfo;
  reasoning_content?: string;
}

export interface LocateModelResponse {
  locatedPixelBbox?: PixelBbox;
  rawResponse: string;
  rawChoiceMessage?: unknown;
  usage?: AIUsageInfo;
  reasoningContent?: string;
  errors?: string[];
}

export type LocateFn = (
  elementDescription: TUserPrompt,
  options: LocateOptions,
  locateRequest: LocateRequestContext,
) => Promise<LocateModelResponse>;
