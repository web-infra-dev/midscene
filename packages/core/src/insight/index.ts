import { callAiFn } from '@/ai-model/common';
import { AiExtractElementInfo, AiLocateElement } from '@/ai-model/index';
import { AiAssert, AiLocateSection } from '@/ai-model/inspect';
import { vlLocateMode } from '@/env';
import type {
  AIElementResponse,
  AISingleElementResponse,
  AIUsageInfo,
  BaseElement,
  DumpSubscriber,
  InsightAction,
  InsightAssertionResponse,
  InsightExtractParam,
  InsightOptions,
  InsightTaskInfo,
  PartialInsightDumpFromSDK,
  PlanningLocateParam,
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

  generateElement: InsightOptions['generateElement'];

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

    this.generateElement = opt?.generateElement;

    if (typeof opt?.aiVendorFn !== 'undefined') {
      this.aiVendorFn = opt.aiVendorFn;
    }
    if (typeof opt?.taskInfo !== 'undefined') {
      this.taskInfo = opt.taskInfo;
    }
  }

  async locate(
    query: string | PlanningLocateParam,
    opt?: LocateOpts,
  ): Promise<ElementType | null>;
  async locate(query: string | PlanningLocateParam, opt?: LocateOpts) {
    const { callAI } = opt || {};
    const queryPrompt = typeof query === 'string' ? query : query.prompt;
    assert(
      queryPrompt || opt?.quickAnswer,
      'query or quickAnswer is required for locate',
    );
    const dumpSubscriber = this.onceDumpUpdatedFn;
    this.onceDumpUpdatedFn = undefined;
    // still under construction
    // const searchArea = typeof query === 'string' ? undefined : query.searchArea;
    const searchAreaPrompt =
      typeof query === 'string' ? undefined : query.searchArea;
    const context = await this.contextRetrieverFn('locate');
    // const { sectionBbox, usage } = await AiLocateSection({
    //   context,
    //   sectionDescription: searchArea,
    // })

    let searchArea: Rect | undefined = undefined;
    let searchAreaRawResponse: string | undefined = undefined;
    let searchAreaUsage: AIUsageInfo | undefined = undefined;
    const searchAreaPadding = 20;
    if (searchAreaPrompt) {
      assert(
        vlLocateMode(),
        'locate with search area is not supported with general purposed LLM. Please use Midscene VL model. https://midscenejs.com/choose-a-model',
      );
      const {
        rect,
        rawResponse,
        usage,
        error: searchAreaError,
      } = await AiLocateSection({
        context,
        sectionDescription: searchAreaPrompt,
      });
      searchArea = rect;
      debug('original searchArea', searchArea);
      assert(searchArea, `cannot find search area for "${searchAreaPrompt}"`);
      assert(
        !searchAreaError,
        `failed to locate search area: ${searchAreaError}`,
      );
      searchAreaRawResponse = rawResponse;
      searchAreaUsage = usage;

      searchArea.left = Math.max(0, searchArea.left - searchAreaPadding);
      searchArea.width = Math.min(
        searchArea.width + searchAreaPadding * 2,
        context.size.width - searchArea.left,
      );

      searchArea.top = Math.max(0, searchArea.top - searchAreaPadding);
      searchArea.height = Math.min(
        searchArea.height + searchAreaPadding * 2,
        context.size.height - searchArea.top,
      );

      debug('adjusted searchArea', searchArea);
    }

    const startTime = Date.now();
    const { parseResult, elementById, rawResponse, usage } =
      await AiLocateElement({
        callAI: callAI || this.aiVendorFn,
        context,
        targetElementDescription: queryPrompt,
        quickAnswer: opt?.quickAnswer,
        searchArea,
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
      data: null,
      taskInfo,
      error: errorLog,
    };

    const logId = emitInsightDump(dumpData, undefined, dumpSubscriber);

    if (errorLog) {
      throw new Error(errorLog);
    }

    const elements: BaseElement[] = [];
    parseResult.elements.forEach((item) => {
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
      logId,
      dumpSubscriber,
    );

    if (elements.length >= 2) {
      console.warn(
        `locate: multiple elements found, return the first one. (query: ${queryPrompt})`,
      );
      return elements[0];
    }
    if (elements.length === 1) {
      return elements[0];
    }
    return null;
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
    const logId = emitInsightDump(dumpData, undefined, dumpSubscriber);

    const { data } = parseResult;
    if (errorLog && !data) {
      console.error(errorLog);
      throw new Error(errorLog);
    }

    emitInsightDump(
      {
        ...dumpData,
        data,
      },
      logId,
      dumpSubscriber,
    );

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
    emitInsightDump(dumpData, undefined, dumpSubscriber);

    return {
      pass,
      thought,
      usage: assertResult.usage,
    };
  }
}
