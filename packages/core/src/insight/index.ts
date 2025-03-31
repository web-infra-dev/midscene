import { callAiFn, expandSearchArea } from '@/ai-model/common';
import { AiExtractElementInfo, AiLocateElement } from '@/ai-model/index';
import { AiAssert, AiLocateSection } from '@/ai-model/inspect';
import {
  MIDSCENE_FORCE_DEEP_THINK,
  getAIConfigInBoolean,
  vlLocateMode,
} from '@/env';
import type {
  AIElementResponse,
  AISingleElementResponse,
  AIUsageInfo,
  BaseElement,
  DetailedLocateParam,
  DumpSubscriber,
  InsightAction,
  InsightAssertionResponse,
  InsightExtractParam,
  InsightOptions,
  InsightTaskInfo,
  LocateResult,
  PartialInsightDumpFromSDK,
  Rect,
  UIContext,
} from '@/types';
import { assert, getDebug } from '@midscene/shared/utils';
import { emitInsightDump } from './utils';

export interface LocateOpts {
  callAI?: typeof callAiFn<AIElementResponse>;
  quickAnswer?: Partial<AISingleElementResponse>;
}

export type AnyValue<T> = {
  [K in keyof T]: unknown extends T[K] ? any : T[K];
};

const debug = getDebug('ai:insight');
export default class Insight<
  ElementType extends BaseElement = BaseElement,
  ContextType extends UIContext<ElementType> = UIContext<ElementType>,
> {
  contextRetrieverFn: (
    action: InsightAction,
  ) => Promise<ContextType> | ContextType;

  aiVendorFn: (...args: Array<any>) => Promise<any> = callAiFn;

  onceDumpUpdatedFn?: DumpSubscriber;

  taskInfo?: Omit<InsightTaskInfo, 'durationMs'>;

  constructor(
    context:
      | ContextType
      | ((action: InsightAction) => Promise<ContextType> | ContextType),
    opt?: InsightOptions,
  ) {
    assert(context, 'context is required for Insight');
    if (typeof context === 'function') {
      this.contextRetrieverFn = context;
    } else {
      this.contextRetrieverFn = () => Promise.resolve(context);
    }

    if (typeof opt?.aiVendorFn !== 'undefined') {
      this.aiVendorFn = opt.aiVendorFn;
    }
    if (typeof opt?.taskInfo !== 'undefined') {
      this.taskInfo = opt.taskInfo;
    }
  }

  async locate(
    query: DetailedLocateParam,
    opt?: LocateOpts,
  ): Promise<LocateResult> {
    const { callAI } = opt || {};
    const queryPrompt = typeof query === 'string' ? query : query.prompt;
    assert(
      queryPrompt || opt?.quickAnswer,
      'query or quickAnswer is required for locate',
    );
    const dumpSubscriber = this.onceDumpUpdatedFn;
    this.onceDumpUpdatedFn = undefined;
    let searchAreaPrompt = undefined;

    assert(typeof query === 'object', 'query should be an object for locate');
    searchAreaPrompt = query.searchArea;

    const globalDeepThinkSwitch = getAIConfigInBoolean(
      MIDSCENE_FORCE_DEEP_THINK,
    );
    if (globalDeepThinkSwitch) {
      debug('globalDeepThinkSwitch', globalDeepThinkSwitch);
    }
    if (!searchAreaPrompt && (query.deepThink || globalDeepThinkSwitch)) {
      searchAreaPrompt = query.prompt;
    }

    if (searchAreaPrompt && !vlLocateMode()) {
      console.warn(
        'The "deepThink" feature is not supported with general purposed LLM. Please config VL model for Midscene. https://midscenejs.com/choose-a-model',
      );
      searchAreaPrompt = undefined;
    }

    const context = await this.contextRetrieverFn('locate');

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
    const { parseResult, rect, elementById, rawResponse, usage } =
      await AiLocateElement({
        callAI: callAI || this.aiVendorFn,
        context,
        targetElementDescription: queryPrompt,
        quickAnswer: opt?.quickAnswer,
        searchConfig: searchAreaResponse,
      });
    // const parseResult = await this.aiVendorFn<AIElementParseResponse>(msgs);
    const timeCost = Date.now() - startTime;
    const taskInfo: InsightTaskInfo = {
      ...(this.taskInfo ? this.taskInfo : {}),
      durationMs: timeCost,
      rawResponse: JSON.stringify(rawResponse),
      formatResponse: JSON.stringify(parseResult),
      usage,
      searchArea,
      searchAreaRawResponse,
      searchAreaUsage,
    };

    let errorLog: string | undefined;
    if (parseResult.errors?.length) {
      errorLog = `locate - AI response error: \n${parseResult.errors.join('\n')}`;
    }

    const dumpData: PartialInsightDumpFromSDK = {
      type: 'locate',
      context,
      userQuery: {
        element: queryPrompt,
      },
      quickAnswer: opt?.quickAnswer,
      matchedElement: [],
      matchedRect: rect,
      data: null,
      taskInfo,
      deepThink: !!searchArea,
      error: errorLog,
    };

    const elements: BaseElement[] = [];
    (parseResult.elements || []).forEach((item) => {
      if ('id' in item) {
        const element = elementById(item.id);

        if (!element) {
          console.warn(
            `locate: cannot find element id=${item.id}. Maybe an unstable response from AI model`,
          );
          return;
        }
        elements.push(element);
      }
    });

    emitInsightDump(
      {
        ...dumpData,
        matchedElement: elements,
      },
      dumpSubscriber,
    );

    if (errorLog) {
      throw new Error(errorLog);
    }

    assert(
      elements.length <= 1,
      `locate: multiple elements found, length = ${elements.length}`,
    );

    if (elements.length === 1) {
      return {
        element: {
          id: elements[0]!.id,
          indexId: elements[0]!.indexId,
          center: elements[0]!.center,
          rect: elements[0]!.rect,
        },
        rect,
      };
    }
    return {
      element: null,
      rect,
    };
  }

  async extract<T = any>(input: string): Promise<T>;
  async extract<T extends Record<string, string>>(
    input: T,
  ): Promise<Record<keyof T, any>>;
  async extract<T extends object>(input: Record<keyof T, string>): Promise<T>;

  async extract<T>(dataDemand: InsightExtractParam): Promise<any> {
    assert(
      typeof dataDemand === 'object' || typeof dataDemand === 'string',
      `dataDemand should be object or string, but get ${typeof dataDemand}`,
    );
    const dumpSubscriber = this.onceDumpUpdatedFn;
    this.onceDumpUpdatedFn = undefined;

    const context = await this.contextRetrieverFn('extract');

    const startTime = Date.now();
    const { parseResult, usage } = await AiExtractElementInfo<T>({
      context,
      dataQuery: dataDemand,
    });

    const timeCost = Date.now() - startTime;
    const taskInfo: InsightTaskInfo = {
      ...(this.taskInfo ? this.taskInfo : {}),
      durationMs: timeCost,
      rawResponse: JSON.stringify(parseResult),
    };

    let errorLog: string | undefined;
    if (parseResult.errors?.length) {
      errorLog = `AI response error: \n${parseResult.errors.join('\n')}`;
    }

    const dumpData: PartialInsightDumpFromSDK = {
      type: 'extract',
      context,
      userQuery: {
        dataDemand,
      },
      matchedElement: [],
      data: null,
      taskInfo,
      error: errorLog,
    };

    const { data } = parseResult || {};

    // 4
    emitInsightDump(
      {
        ...dumpData,
        data,
      },
      dumpSubscriber,
    );

    if (errorLog && !data) {
      throw new Error(errorLog);
    }

    return {
      data,
      usage,
    };
  }

  async assert(assertion: string): Promise<InsightAssertionResponse> {
    if (typeof assertion !== 'string') {
      throw new Error(
        'This is the assert method for Midscene, the first argument should be a string. If you want to use the assert method from Node.js, please import it from the Node.js assert module.',
      );
    }

    const dumpSubscriber = this.onceDumpUpdatedFn;
    this.onceDumpUpdatedFn = undefined;

    const context = await this.contextRetrieverFn('assert');
    const startTime = Date.now();
    const assertResult = await AiAssert({
      assertion,
      context,
    });

    const timeCost = Date.now() - startTime;
    const taskInfo: InsightTaskInfo = {
      ...(this.taskInfo ? this.taskInfo : {}),
      durationMs: timeCost,
      rawResponse: JSON.stringify(assertResult.content),
    };

    const { thought, pass } = assertResult.content;
    const dumpData: PartialInsightDumpFromSDK = {
      type: 'assert',
      context,
      userQuery: {
        assertion,
      },
      matchedElement: [],
      data: null,
      taskInfo,
      assertionPass: pass,
      assertionThought: thought,
      error: pass ? undefined : thought,
    };
    emitInsightDump(dumpData, dumpSubscriber);

    return {
      pass,
      thought,
      usage: assertResult.usage,
    };
  }
}
