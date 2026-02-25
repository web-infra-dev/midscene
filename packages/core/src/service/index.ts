import { isAutoGLM, isUITars } from '@/ai-model/auto-glm/util';
import {
  AIResponseParseError,
  AiExtractElementInfo,
  AiLocateElement,
  callAIWithObjectResponse,
} from '@/ai-model/index';
import { AiLocateSection } from '@/ai-model/inspect';
import { elementDescriberInstruction } from '@/ai-model/prompt/describe';
import { type AIArgs, expandSearchArea } from '@/common';
import type {
  AIDescribeElementResponse,
  AIUsageInfo,
  DetailedLocateParam,
  LocateResultWithDump,
  PartialServiceDumpFromSDK,
  Rect,
  ServiceExtractOption,
  ServiceExtractParam,
  ServiceExtractResult,
  ServiceTaskInfo,
  UIContext,
} from '@/types';
import { ServiceError } from '@/types';
import {
  type IModelConfig,
  MIDSCENE_FORCE_DEEP_THINK,
  globalConfigManager,
} from '@midscene/shared/env';
import { compositeElementInfoImg, cropByRect } from '@midscene/shared/img';
import { getDebug } from '@midscene/shared/logger';
import { assert } from '@midscene/shared/utils';
import type { TMultimodalPrompt } from '../common';
import { createServiceDump } from './utils';

export interface LocateOpts {
  context?: UIContext;
}

export type AnyValue<T> = {
  [K in keyof T]: unknown extends T[K] ? any : T[K];
};

interface ServiceOptions {
  taskInfo?: Omit<ServiceTaskInfo, 'durationMs'>;
}

const debug = getDebug('ai:service');
export default class Service {
  contextRetrieverFn: () => Promise<UIContext> | UIContext;

  taskInfo?: Omit<ServiceTaskInfo, 'durationMs'>;

  constructor(
    context: UIContext | (() => Promise<UIContext> | UIContext),
    opt?: ServiceOptions,
  ) {
    assert(context, 'context is required for Service');
    if (typeof context === 'function') {
      this.contextRetrieverFn = context;
    } else {
      this.contextRetrieverFn = () => Promise.resolve(context);
    }

    if (typeof opt?.taskInfo !== 'undefined') {
      this.taskInfo = opt.taskInfo;
    }
  }

  async locate(
    query: DetailedLocateParam,
    opt: LocateOpts,
    modelConfig: IModelConfig,
  ): Promise<LocateResultWithDump> {
    const queryPrompt = typeof query === 'string' ? query : query.prompt;
    assert(queryPrompt, 'query is required for locate');

    assert(typeof query === 'object', 'query should be an object for locate');

    const globalDeepThinkSwitch = globalConfigManager.getEnvConfigInBoolean(
      MIDSCENE_FORCE_DEEP_THINK,
    );
    if (globalDeepThinkSwitch) {
      debug('globalDeepThinkSwitch', globalDeepThinkSwitch);
    }
    let searchAreaPrompt;
    if (query.deepThink || globalDeepThinkSwitch) {
      searchAreaPrompt = query.prompt;
    }

    const { modelFamily } = modelConfig;

    if (searchAreaPrompt && !modelFamily) {
      console.warn(
        'The "deepThink" feature is not supported with multimodal LLM. Please config VL model for Midscene. https://midscenejs.com/model-config',
      );
      searchAreaPrompt = undefined;
    }

    if (searchAreaPrompt && isAutoGLM(modelFamily)) {
      console.warn('The "deepThink" feature is not supported with AutoGLM.');
      searchAreaPrompt = undefined;
    }

    const context = opt?.context || (await this.contextRetrieverFn());

    let searchArea: Rect | undefined = undefined;
    let searchAreaRawResponse: string | undefined = undefined;
    let searchAreaUsage: AIUsageInfo | undefined = undefined;
    let searchAreaResponse:
      | Awaited<ReturnType<typeof AiLocateSection>>
      | undefined = undefined;
    if (searchAreaPrompt) {
      searchAreaResponse = await AiLocateSection({
        context,
        sectionDescription: searchAreaPrompt,
        modelConfig,
      });
      assert(
        searchAreaResponse.rect,
        `cannot find search area for "${searchAreaPrompt}"${
          searchAreaResponse.error ? `: ${searchAreaResponse.error}` : ''
        }`,
      );
      searchAreaRawResponse = searchAreaResponse.rawResponse;
      searchAreaUsage = searchAreaResponse.usage;
      searchArea = searchAreaResponse.rect;
    }

    const startTime = Date.now();
    const { parseResult, rect, rawResponse, usage, reasoning_content } =
      await AiLocateElement({
        context,
        targetElementDescription: queryPrompt,
        searchConfig: searchAreaResponse,
        modelConfig,
      });

    const timeCost = Date.now() - startTime;
    const taskInfo: ServiceTaskInfo = {
      ...(this.taskInfo ? this.taskInfo : {}),
      durationMs: timeCost,
      rawResponse: JSON.stringify(rawResponse),
      formatResponse: JSON.stringify(parseResult),
      usage,
      searchArea,
      searchAreaRawResponse,
      searchAreaUsage,
      reasoning_content,
    };

    let errorLog: string | undefined;
    if (parseResult.errors?.length) {
      errorLog = `failed to locate element: \n${parseResult.errors.join('\n')}`;
    }

    const dumpData: PartialServiceDumpFromSDK = {
      type: 'locate',
      userQuery: {
        element: queryPrompt,
      },
      matchedElement: [],
      matchedRect: rect,
      data: null,
      taskInfo,
      deepThink: !!searchArea,
      error: errorLog,
    };

    const elements = parseResult.elements || [];

    const dump = createServiceDump({
      ...dumpData,
      matchedElement: elements,
    });

    if (errorLog) {
      throw new ServiceError(errorLog, dump);
    }

    if (elements.length > 1) {
      throw new ServiceError(
        `locate: multiple elements found, length = ${elements.length}`,
        dump,
      );
    }

    if (elements.length === 1) {
      return {
        element: {
          center: elements[0]!.center,
          rect: elements[0]!.rect,
          description: elements[0]!.description,
        },
        rect,
        dump,
      };
    }

    return {
      element: null,
      rect,
      dump,
    };
  }

  async extract<T>(
    dataDemand: ServiceExtractParam,
    modelConfig: IModelConfig,
    opt?: ServiceExtractOption,
    pageDescription?: string,
    multimodalPrompt?: TMultimodalPrompt,
    context?: UIContext,
  ): Promise<ServiceExtractResult<T>> {
    assert(context, 'context is required for extract');
    assert(
      typeof dataDemand === 'object' || typeof dataDemand === 'string',
      `dataDemand should be object or string, but get ${typeof dataDemand}`,
    );

    const startTime = Date.now();

    let parseResult: Awaited<
      ReturnType<typeof AiExtractElementInfo<T>>
    >['parseResult'];
    let rawResponse: string;
    let usage: Awaited<ReturnType<typeof AiExtractElementInfo<T>>>['usage'];
    let reasoning_content: string | undefined;

    try {
      const result = await AiExtractElementInfo<T>({
        context,
        dataQuery: dataDemand,
        multimodalPrompt,
        extractOption: opt,
        modelConfig,
        pageDescription,
      });
      parseResult = result.parseResult;
      rawResponse = result.rawResponse;
      usage = result.usage;
      reasoning_content = result.reasoning_content;
    } catch (error) {
      if (error instanceof AIResponseParseError) {
        // Create dump with usage and rawResponse from the error
        const timeCost = Date.now() - startTime;
        const taskInfo: ServiceTaskInfo = {
          ...(this.taskInfo ? this.taskInfo : {}),
          durationMs: timeCost,
          rawResponse: error.rawResponse,
          usage: error.usage,
        };
        const dump = createServiceDump({
          type: 'extract',
          userQuery: { dataDemand },
          matchedElement: [],
          data: null,
          taskInfo,
          error: error.message,
        });
        throw new ServiceError(error.message, dump);
      }
      throw error;
    }

    const timeCost = Date.now() - startTime;
    const taskInfo: ServiceTaskInfo = {
      ...(this.taskInfo ? this.taskInfo : {}),
      durationMs: timeCost,
      rawResponse,
      formatResponse: JSON.stringify(parseResult),
      usage,
      reasoning_content,
    };

    let errorLog: string | undefined;
    if (parseResult.errors?.length) {
      errorLog = `AI response error: \n${parseResult.errors.join('\n')}`;
    }

    const dumpData: PartialServiceDumpFromSDK = {
      type: 'extract',
      userQuery: {
        dataDemand,
      },
      matchedElement: [],
      data: null,
      taskInfo,
      error: errorLog,
    };

    const { data, thought } = parseResult || {};

    const dump = createServiceDump({
      ...dumpData,
      data,
    });

    if (errorLog && !data) {
      throw new ServiceError(errorLog, dump);
    }

    return {
      data,
      thought,
      usage,
      reasoning_content,
      dump,
    };
  }

  async describe(
    target: Rect | [number, number],
    modelConfig: IModelConfig,
    opt?: {
      deepThink?: boolean;
    },
  ): Promise<Pick<AIDescribeElementResponse, 'description'>> {
    assert(target, 'target is required for service.describe');
    const context = await this.contextRetrieverFn();
    const { shotSize } = context;
    const screenshotBase64 = context.screenshot.base64;
    assert(screenshotBase64, 'screenshot is required for service.describe');
    // The result of the "describe" function will be used for positioning, so essentially it is a form of grounding.
    const { modelFamily } = modelConfig;
    const systemPrompt = elementDescriberInstruction();

    // Convert [x,y] center point to Rect if needed
    const defaultRectSize = 30;
    const targetRect: Rect = Array.isArray(target)
      ? {
          left: Math.floor(target[0] - defaultRectSize / 2),
          top: Math.floor(target[1] - defaultRectSize / 2),
          width: defaultRectSize,
          height: defaultRectSize,
        }
      : target;

    let imagePayload = await compositeElementInfoImg({
      inputImgBase64: screenshotBase64,
      size: shotSize,
      elementsPositionInfo: [
        {
          rect: targetRect,
        },
      ],
      borderThickness: 3,
    });

    if (opt?.deepThink) {
      const searchArea = expandSearchArea(targetRect, shotSize);
      // Only crop when the search area covers at least 50% of the screen
      // in both dimensions. Small crops (e.g., 500px on 1920x1080) lose
      // too much context and cause model hallucinations.
      const widthRatio = searchArea.width / shotSize.width;
      const heightRatio = searchArea.height / shotSize.height;
      if (widthRatio >= 0.5 && heightRatio >= 0.5) {
        debug('describe: cropping to searchArea', searchArea);
        const croppedResult = await cropByRect(
          imagePayload,
          searchArea,
          modelFamily === 'qwen2.5-vl',
        );
        imagePayload = croppedResult.imageBase64;
      } else {
        debug(
          'describe: skip cropping, search area too small (%dx%d on %dx%d)',
          searchArea.width,
          searchArea.height,
          shotSize.width,
          shotSize.height,
        );
      }
    }

    const msgs: AIArgs = [
      { role: 'system', content: systemPrompt },
      {
        role: 'user',
        content: [
          {
            type: 'image_url',
            image_url: {
              url: imagePayload,
              detail: 'high',
            },
          },
        ],
      },
    ];

    const res = await callAIWithObjectResponse<AIDescribeElementResponse>(
      msgs,
      modelConfig,
    );

    const { content } = res;
    assert(!content.error, `describe failed: ${content.error}`);
    assert(content.description, 'failed to describe the element');
    return content;
  }
}
