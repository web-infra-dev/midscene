import { defaultModelFamilyRequiredForLocateMessage } from '@/ai-model/errors';
import {
  AiExtractElementInfo,
  AiLocateElement,
  AiLocateSection,
  buildSearchAreaConfig,
} from '@/ai-model/inspect';
import type { ModelRuntime } from '@/ai-model/models';
import { elementDescriberInstruction } from '@/ai-model/prompt/describe';
import {
  AIResponseParseError,
  callAIWithObjectResponse,
} from '@/ai-model/service-caller';
import type { AIArgs } from '@/ai-model/types';
import type { SearchAreaConfig } from '@/ai-model/workflows/inspect/types';
import { expandSearchArea } from '@/common';
import type {
  AIDescribeElementResponse,
  AIUsageInfo,
  DetailedLocateParam,
  LocateResultElement,
  LocateResultWithDump,
  PartialServiceDumpFromSDK,
  PlanningLocateParam,
  Rect,
  ServiceExtractOption,
  ServiceExtractParam,
  ServiceExtractResult,
  ServiceTaskInfo,
  UIContext,
} from '@/types';
import { ServiceError } from '@/types';
import { compositeElementInfoImg, cropByRect } from '@midscene/shared/img';
import { getDebug } from '@midscene/shared/logger';
import { assert } from '@midscene/shared/utils';
import type { TMultimodalPrompt, TUserPrompt } from '../common';
import { createServiceDump } from './utils';

export interface LocateOpts {
  context?: UIContext;
  planLocatedElement?: LocateResultElement;
}

export type AnyValue<T> = {
  [K in keyof T]: unknown extends T[K] ? any : T[K];
};

interface ServiceOptions {
  taskInfo?: Omit<ServiceTaskInfo, 'durationMs'>;
}

interface LocateSearchAreaResult {
  config?: SearchAreaConfig;
  trace: {
    sourceRect?: Rect;
    rawResponse?: string;
    usage?: AIUsageInfo;
  };
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
    query: PlanningLocateParam,
    opt: LocateOpts,
    modelRuntime: ModelRuntime,
    abortSignal?: AbortSignal,
  ): Promise<LocateResultWithDump> {
    const { config: modelConfig } = modelRuntime;
    const queryPrompt = typeof query === 'string' ? query : query.prompt;
    assert(queryPrompt, 'query is required for locate');

    assert(typeof query === 'object', 'query should be an object for locate');

    if (!modelConfig.modelFamily) {
      throw new Error(defaultModelFamilyRequiredForLocateMessage);
    }

    const context = opt?.context || (await this.contextRetrieverFn());

    const searchArea = await this.resolveLocateSearchArea({
      query,
      queryPrompt,
      opt,
      context,
      modelRuntime,
      abortSignal,
    });

    const startTime = Date.now();
    const { parseResult, rect, rawResponse, usage, reasoning_content } =
      await AiLocateElement({
        context,
        targetElementDescription: queryPrompt,
        searchConfig: searchArea.config,
        modelRuntime,
        abortSignal,
      });

    const timeCost = Date.now() - startTime;
    const taskInfo: ServiceTaskInfo = {
      ...(this.taskInfo ? this.taskInfo : {}),
      durationMs: timeCost,
      rawResponse: JSON.stringify(rawResponse),
      formatResponse: JSON.stringify(parseResult),
      usage,
      searchArea: searchArea.trace.sourceRect,
      searchAreaRawResponse: searchArea.trace.rawResponse,
      searchAreaUsage: searchArea.trace.usage,
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
      matchedRect: rect,
      data: null,
      taskInfo,
      deepLocate: !!searchArea.trace.sourceRect,
      error: errorLog,
    };

    const element = parseResult.element;

    const dump = createServiceDump({
      ...dumpData,
      matchedElement: element ? [element] : [],
    });

    if (errorLog) {
      throw new ServiceError(errorLog, dump);
    }

    if (element) {
      return {
        element: {
          center: element.center,
          rect: element.rect,
          description: element.description,
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

  private async resolveLocateSearchArea(options: {
    query: PlanningLocateParam;
    queryPrompt: TUserPrompt;
    opt: LocateOpts;
    context: UIContext;
    modelRuntime: ModelRuntime;
    abortSignal?: AbortSignal;
  }): Promise<LocateSearchAreaResult> {
    const { query, queryPrompt, opt, context, modelRuntime, abortSignal } =
      options;
    const { adapter } = modelRuntime;
    const hasPlanLocatedElement = !!opt?.planLocatedElement?.rect;

    if (!query.deepLocate) {
      return { trace: {} };
    }

    if (hasPlanLocatedElement) {
      const config = await buildSearchAreaConfig({
        context,
        baseRect: opt.planLocatedElement!.rect,
      });

      return {
        config,
        trace: {
          sourceRect: config.sourceRect,
          rawResponse: JSON.stringify({
            source: 'plan-located-element',
            rect: opt.planLocatedElement!.rect,
          }),
        },
      };
    }

    if (adapter.locate.supportsSearchArea) {
      const searchAreaResponse = await AiLocateSection({
        context,
        sectionDescription: queryPrompt,
        modelRuntime,
        abortSignal,
      });
      const { searchAreaConfig } = searchAreaResponse;
      assert(
        searchAreaConfig,
        `cannot find search area for "${queryPrompt}"${
          searchAreaResponse.error ? `: ${searchAreaResponse.error}` : ''
        }`,
      );

      return {
        config: searchAreaConfig,
        trace: {
          sourceRect: searchAreaConfig.sourceRect,
          rawResponse: searchAreaResponse.rawResponse,
          usage: searchAreaResponse.usage,
        },
      };
    }

    const firstPassLocateResult = await AiLocateElement({
      context,
      targetElementDescription: queryPrompt,
      modelRuntime,
      abortSignal,
    });
    assert(
      firstPassLocateResult.rect,
      `cannot find search area for "${queryPrompt}"${
        firstPassLocateResult.parseResult.errors?.length
          ? `: ${firstPassLocateResult.parseResult.errors.join('\n')}`
          : ''
      }`,
    );

    const config = await buildSearchAreaConfig({
      context,
      baseRect: firstPassLocateResult.rect,
    });

    return {
      config,
      trace: {
        sourceRect: config.sourceRect,
        rawResponse: JSON.stringify({
          source: 'deep-locate-first-pass',
          rect: firstPassLocateResult.rect,
          rawResponse: firstPassLocateResult.rawResponse,
        }),
        usage: firstPassLocateResult.usage,
      },
    };
  }

  async extract<T>(
    dataDemand: ServiceExtractParam,
    modelRuntime: ModelRuntime,
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
        modelRuntime,
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
    modelRuntime: ModelRuntime,
    opt?: {
      deepLocate?: boolean;
    },
  ): Promise<Pick<AIDescribeElementResponse, 'description'>> {
    assert(target, 'target is required for service.describe');
    const context = await this.contextRetrieverFn();
    const { shotSize } = context;
    const screenshotBase64 = context.screenshot.base64;
    assert(screenshotBase64, 'screenshot is required for service.describe');
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

    if (opt?.deepLocate) {
      const searchArea = expandSearchArea(targetRect, shotSize);
      // Always crop in describe mode. Unlike locate's deepLocate (where
      // cropping too small loses context for finding elements), describe's
      // deepLocate intentionally zooms in so the model produces a more
      // precise description from a focused view. expandSearchArea already
      // guarantees a minimum 400x400 area with surrounding context.
      // Describe is not a coordinate-parsing flow, so it does not need image
      // padding for bbox normalization.
      debug('describe: cropping to searchArea', searchArea);
      const croppedResult = await cropByRect(imagePayload, searchArea);
      imagePayload = croppedResult.imageBase64;
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
      modelRuntime,
    );

    const { content } = res;
    assert(!content.error, `describe failed: ${content.error}`);
    assert(content.description, 'failed to describe the element');
    return content;
  }
}
