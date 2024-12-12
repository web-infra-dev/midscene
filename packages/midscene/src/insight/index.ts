import assert from 'node:assert';
import { callAiFn } from '@/ai-model/common';
import { AiExtractElementInfo, AiInspectElement } from '@/ai-model/index';
import { AiAssert } from '@/ai-model/inspect';
import type {
  AIElementResponse,
  AISingleElementResponse,
  BaseElement,
  DumpSubscriber,
  InsightAction,
  InsightAssertionResponse,
  InsightExtractParam,
  InsightOptions,
  InsightTaskInfo,
  PartialInsightDumpFromSDK,
  UIContext,
} from '@/types';
import {
  ifElementTypeResponse,
  splitElementResponse,
} from '../ai-model/prompt/util';
import { idsIntoElements, shallowExpandIds, writeInsightDump } from './utils';

export interface LocateOpts {
  multi?: boolean;
  callAI?: typeof callAiFn<AIElementResponse>;
  quickAnswer?: AISingleElementResponse;
}

// export type UnwrapDataShape<T> = T extends EnhancedQuery<infer DataShape> ? DataShape : {};

export type AnyValue<T> = {
  [K in keyof T]: unknown extends T[K] ? any : T[K];
};

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
    queryPrompt: string,
    opt?: {
      callAI?: typeof callAiFn<AIElementResponse>;
      quickAnswer?: AISingleElementResponse | null;
    },
  ): Promise<ElementType | null>;
  async locate(
    queryPrompt: string,
    opt: { multi: true },
  ): Promise<ElementType[]>;
  async locate(queryPrompt: string, opt?: LocateOpts) {
    const { callAI, multi = false } = opt || {};
    assert(
      queryPrompt || opt?.quickAnswer,
      'query or quickAnswer is required for locate',
    );
    const dumpSubscriber = this.onceDumpUpdatedFn;
    this.onceDumpUpdatedFn = undefined;
    const context = await this.contextRetrieverFn('locate');

    const startTime = Date.now();
    const { parseResult, elementById, rawResponse, usage } =
      await AiInspectElement({
        callAI,
        context,
        multi: Boolean(multi),
        targetElementDescription: queryPrompt,
        quickAnswer: opt?.quickAnswer,
      });
    // const parseResult = await this.aiVendorFn<AIElementParseResponse>(msgs);
    const timeCost = Date.now() - startTime;
    const taskInfo: InsightTaskInfo = {
      ...(this.taskInfo ? this.taskInfo : {}),
      durationMs: timeCost,
      rawResponse: JSON.stringify(rawResponse),
      formatResponse: JSON.stringify(parseResult),
      usage,
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
      matchedSection: [],
      matchedElement: [],
      data: null,
      taskInfo,
      error: errorLog,
    };

    const logId = writeInsightDump(dumpData, undefined, dumpSubscriber);

    if (errorLog) {
      console.error(errorLog);
      throw new Error(errorLog);
    }

    const elements: BaseElement[] = [];
    parseResult.elements.forEach((item) => {
      if ('id' in item) {
        const element = elementById(item.id as string);

        if (!element) {
          console.warn(
            `locate: cannot find element id=${item.id}. Maybe an unstable response from AI model`,
          );
          return;
        }
        elements.push(element);
      }
    });

    writeInsightDump(
      {
        ...dumpData,
        matchedElement: elements,
      },
      logId,
      dumpSubscriber,
    );

    if (opt?.multi) {
      return elements;
    }
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
    const { parseResult, elementById } = await AiExtractElementInfo<T>({
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
      errorLog = `segment - AI response error: \n${parseResult.errors.join('\n')}`;
    }

    const dumpData: PartialInsightDumpFromSDK = {
      type: 'extract',
      context,
      userQuery: {
        dataDemand,
      },
      matchedSection: [],
      matchedElement: [],
      data: null,
      taskInfo,
      error: errorLog,
    };
    const logId = writeInsightDump(dumpData, undefined, dumpSubscriber);

    if (errorLog) {
      console.error(errorLog);
      throw new Error(errorLog);
    }

    const { data } = parseResult;
    let mergedData = data;

    // expand elements in object style data
    if (data && typeof data === 'object' && !Array.isArray(data)) {
      shallowExpandIds(data, ifElementTypeResponse, (id) => {
        const idList = splitElementResponse(id);
        if (typeof idList === 'string') {
          return elementById(idList);
        }
        if (Array.isArray(idList)) {
          return idsIntoElements(idList, elementById);
        }
        return idList; // i.e. null
      });

      mergedData = {
        ...data,
      };
    }

    writeInsightDump(
      {
        ...dumpData,
        matchedSection: [],
        data: mergedData,
      },
      logId,
      dumpSubscriber,
    );

    return mergedData;
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
      usage: assertResult.usage,
    };

    const { thought, pass } = assertResult.content;
    const dumpData: PartialInsightDumpFromSDK = {
      type: 'assert',
      context,
      userQuery: {
        assertion,
      },
      matchedSection: [],
      matchedElement: [],
      data: null,
      taskInfo,
      assertionPass: pass,
      assertionThought: thought,
      error: pass ? undefined : thought,
    };
    writeInsightDump(dumpData, undefined, dumpSubscriber);

    return {
      pass,
      thought,
    };
  }
}
