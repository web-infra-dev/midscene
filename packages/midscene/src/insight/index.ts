import assert from 'assert';
import {
  // describeUserPage as defaultDescriber,
  ifElementTypeResponse,
  splitElementResponse,
  extractSectionQuery,
} from '../ai-model/prompt/util';
import { expandLiteSection, shallowExpandIds, idsIntoElements, writeInsightDump } from './utils';
import { AiInspectElement, callToGetJSONObject as callAI, AiExtractElementInfo } from '@/ai-model/index';
import {
  UISection,
  UIContext,
  InsightOptions,
  InsightTaskInfo,
  PartialInsightDumpFromSDK,
  BaseElement,
  DumpSubscriber,
  InsightExtractParam,
} from '@/types';

const sortByOrder = (a: UISection, b: UISection) => {
  if (a.rect.top - b.rect.top !== 0) {
    return a.rect.top - b.rect.top;
  } else {
    return a.rect.left - b.rect.left;
  }
};

export interface FindElementOptions {
  multi?: boolean;
}

// export type UnwrapDataShape<T> = T extends EnhancedQuery<infer DataShape> ? DataShape : {};

export type AnyValue<T> = {
  [K in keyof T]: unknown extends T[K] ? any : T[K];
};

export default class Insight<ElementType extends BaseElement = BaseElement> {
  contextRetrieverFn: () => Promise<UIContext<ElementType>> | UIContext<ElementType>;

  aiVendorFn: typeof callAI = callAI;

  onceDumpUpdatedFn?: DumpSubscriber;

  taskInfo?: Omit<InsightTaskInfo, 'durationMs'>;

  constructor(
    context: UIContext<ElementType> | (() => Promise<UIContext<ElementType>> | UIContext<ElementType>),
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
      this.taskInfo = opt.taskInfo; // TODO: remove `name` field
    }
  }

  async find(queryPrompt: string): Promise<ElementType | null>;
  async find(queryPrompt: string, opt: { multi: true }): Promise<ElementType[]>;
  async find(queryPrompt: string, opt?: FindElementOptions) {
    assert(queryPrompt, 'query is required for find');
    const dumpSubscriber = this.onceDumpUpdatedFn;
    this.onceDumpUpdatedFn = undefined;
    const context = await this.contextRetrieverFn();

    const startTime = Date.now();
    const { parseResult, systemPrompt, elementById } = await AiInspectElement({
      callAI: this.aiVendorFn,
      context,
      multi: Boolean(opt?.multi),
      findElementDescription: queryPrompt,
    });
    // const parseResult = await this.aiVendorFn<AIElementParseResponse>(msgs);
    const timeCost = Date.now() - startTime;
    const taskInfo: InsightTaskInfo = {
      ...(this.taskInfo ? this.taskInfo : {}),
      durationMs: timeCost,
      rawResponse: JSON.stringify(parseResult),
      systemPrompt,
    };

    let errorLog: string | undefined;
    if (parseResult.errors?.length) {
      errorLog = `find - AI response error: \n${parseResult.errors.join('\n')}`;
    }

    const dumpData: PartialInsightDumpFromSDK = {
      type: 'find',
      context,
      userQuery: {
        element: queryPrompt,
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

    const elements: BaseElement[] = [];
    parseResult.elements.forEach((item) => {
      const element = elementById(item.id);

      if (!element) {
        console.warn(`find: cannot find element id=${item.id}. Maybe an unstable response from AI model`);
        return;
      }
      elements.push(element);
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
    } else if (elements.length >= 2) {
      console.warn(`find: multiple elements found, return the first one. (query: ${queryPrompt})`);
      return elements[0];
    } else if (elements.length === 1) {
      return elements[0];
    } else {
      return null;
    }
  }

  async extract<T = any>(input: string): Promise<T>;
  async extract<T extends Record<string, string>>(input: T): Promise<Record<keyof T, any>>;
  async extract<T extends object>(input: Record<keyof T, string>): Promise<T>;

  async extract<T>(dataDemand: InsightExtractParam): Promise<any> {
    let dataQuery: Record<string, string> | string = {};
    const sectionQueryMap: Record<string, string> = {};
    assert(
      typeof dataDemand === 'object' || typeof dataDemand === 'string',
      `dataDemand should be object or string, but get ${typeof dataDemand}`,
    );
    const dumpSubscriber = this.onceDumpUpdatedFn;
    this.onceDumpUpdatedFn = undefined;
    if (typeof dataDemand === 'string') {
      dataQuery = dataDemand;
    } else {
      // filter all sectionQuery
      for (const key in dataDemand) {
        const query = dataDemand[key];
        const sectionQuery = extractSectionQuery(query);
        if (sectionQuery) {
          sectionQueryMap[key] = sectionQuery;
        } else {
          dataQuery[key] = query;
        }
      }
      dataQuery = dataDemand;
    }

    const sectionConstraints = Object.keys(sectionQueryMap).map((name) => {
      const sectionQueryPrompt = sectionQueryMap[name];
      return {
        name,
        description: sectionQueryPrompt || '',
      };
    });

    const context = await this.contextRetrieverFn();

    const startTime = Date.now();
    const { parseResult, systemPrompt, elementById } = await AiExtractElementInfo<T>({
      context,
      dataQuery,
      sectionConstraints,
      callAI: this.aiVendorFn,
    });

    const timeCost = Date.now() - startTime;
    const taskInfo: InsightTaskInfo = {
      ...(this.taskInfo ? this.taskInfo : {}),
      durationMs: timeCost,
      rawResponse: JSON.stringify(parseResult),
      systemPrompt,
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

    // expand all ids into original elements
    const sectionsArr = (parseResult.sections || [])
      .map((liteSection) => {
        const section: UISection = expandLiteSection(liteSection, (id) => elementById(id));
        return section;
      })
      .sort(sortByOrder);

    // deal sections array into a map
    const sectionMap = sectionsArr.reduce((acc: any, section) => {
      const { name } = section;

      if (acc[name]) {
        let i = 1;
        while (acc[`${name}_${i}`]) {
          i++;
        }
        console.warn(`section name conflict: ${name}, rename to ${name}_${i}`);
        acc[`${name}_${i}`] = section;
      } else {
        acc[name] = section;
      }
      return acc;
    }, {});

    const { data } = parseResult;
    let mergedData = data;

    // expand elements in object style data
    if (data && typeof data === 'object' && !Array.isArray(data)) {
      shallowExpandIds(data, ifElementTypeResponse, (id) => {
        const idList = splitElementResponse(id);
        if (typeof idList === 'string') {
          return elementById(idList);
        } else if (Array.isArray(idList)) {
          return idsIntoElements(idList, elementById);
        }
        return idList; // i.e. null
      });

      mergedData = {
        ...data,
        ...sectionMap,
      };
    }

    writeInsightDump(
      {
        ...dumpData,
        matchedSection: Object.values(sectionMap),
        data: mergedData,
      },
      logId,
      dumpSubscriber,
    );

    return mergedData;
  }
}
