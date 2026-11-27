import type { TUserPrompt } from '@/ai-model/index';
import type { ModelTaskType } from '@/ai-model/model-adapter/types';
import type { ModelRuntime } from '@/ai-model/models';
import {
  type InsightOptions,
  queryInputFromPrompt,
} from '@/ai-model/workflows/insight/query-input';
import type {
  AgentAssertResult,
  AssertOptions,
  InsightAPI,
  QueryOptions,
  ServiceExtractParam,
  UIContext,
} from '@/types';
import type { AiApiName } from '@midscene/shared/agent-tools/agent-context';
import { TaskExecutionError, type TaskExecutor } from './tasks';

const defaultQueryOptions: QueryOptions = {
  domIncluded: false,
  screenshotIncluded: true,
};

type InsightTaskExecutor = Pick<TaskExecutor, 'createTypeQueryExecution'>;

type PublicContextOptions = { context?: string };

/** Execute read-only AI operations against either live or fixed UI context. */
export class Insight implements InsightAPI {
  constructor(
    private readonly taskExecutor: InsightTaskExecutor,
    private readonly resolveModelRuntime: (
      taskType: ModelTaskType,
    ) => ModelRuntime,
    private readonly resolveAgentUserContext: (
      apiName: AiApiName,
      callUserContext?: string,
    ) => string | undefined,
    private readonly getUIContext?: () => UIContext,
  ) {}

  private resolveUserContext(
    apiName: AiApiName,
    options?: PublicContextOptions,
  ): string | undefined {
    return this.resolveAgentUserContext(apiName, options?.context);
  }

  private withUserContext<T extends PublicContextOptions>(
    apiName: AiApiName,
    options: T,
  ): Omit<T, 'context'> & { userContext?: string } {
    const userContext = this.resolveUserContext(apiName, options);
    const { context: _context, ...restOptions } = options;
    return {
      ...restOptions,
      ...(userContext !== undefined ? { userContext } : {}),
    };
  }

  private executionOptions(
    options?: AssertOptions,
    includeAbortSignal = false,
  ): { abortSignal?: AbortSignal; uiContext?: UIContext } | undefined {
    const uiContext = this.getUIContext?.();
    if (!uiContext && !includeAbortSignal && !options?.abortSignal) {
      return undefined;
    }
    return {
      ...(includeAbortSignal || options?.abortSignal
        ? { abortSignal: options?.abortSignal }
        : {}),
      ...(uiContext ? { uiContext } : {}),
    };
  }

  async aiQuery<ReturnType = any>(
    demand: ServiceExtractParam,
    options: QueryOptions = defaultQueryOptions,
  ): Promise<ReturnType> {
    const modelRuntime = this.resolveModelRuntime('extract');
    const executionOptions = this.executionOptions();
    const serviceOptions = this.withUserContext('aiQuery', options);
    const { output } = await this.taskExecutor.createTypeQueryExecution(
      'Query',
      { demand },
      modelRuntime,
      serviceOptions,
      executionOptions,
    );
    return output as ReturnType;
  }

  async aiBoolean(
    prompt: TUserPrompt,
    options: QueryOptions = defaultQueryOptions,
  ): Promise<boolean> {
    return this.queryPrimitive('Boolean', 'aiBoolean', prompt, options);
  }

  async aiNumber(
    prompt: TUserPrompt,
    options: QueryOptions = defaultQueryOptions,
  ): Promise<number> {
    return this.queryPrimitive('Number', 'aiNumber', prompt, options);
  }

  async aiString(
    prompt: TUserPrompt,
    options: QueryOptions = defaultQueryOptions,
  ): Promise<string> {
    return this.queryPrimitive('String', 'aiString', prompt, options);
  }

  async aiAsk(
    prompt: TUserPrompt,
    options: QueryOptions = defaultQueryOptions,
  ): Promise<string> {
    return this.queryPrimitive('String', 'aiAsk', prompt, options);
  }

  private async queryPrimitive<ReturnType>(
    type: 'Boolean' | 'Number' | 'String',
    apiName: 'aiBoolean' | 'aiNumber' | 'aiString' | 'aiAsk',
    prompt: TUserPrompt,
    options: QueryOptions,
  ): Promise<ReturnType> {
    const serviceOptions = this.withUserContext(apiName, options);
    const { output } = await this.taskExecutor.createTypeQueryExecution(
      type,
      queryInputFromPrompt(prompt),
      this.resolveModelRuntime(type === 'Boolean' ? 'boolean' : 'extract'),
      serviceOptions,
      this.executionOptions(),
    );
    return output as ReturnType;
  }

  async aiAssert(
    assertion: TUserPrompt,
    message?: string,
    options?: AssertOptions,
  ): Promise<AgentAssertResult | undefined> {
    const userContextOptions = this.withUserContext('aiAssert', options ?? {});
    const serviceOptions: InsightOptions = {
      domIncluded: options?.domIncluded ?? defaultQueryOptions.domIncluded,
      screenshotIncluded:
        options?.screenshotIncluded ?? defaultQueryOptions.screenshotIncluded,
      ...(userContextOptions.userContext !== undefined
        ? { userContext: userContextOptions.userContext }
        : {}),
    };
    const assertionText =
      typeof assertion === 'string' ? assertion : assertion.prompt;

    try {
      const { output, thought } =
        await this.taskExecutor.createTypeQueryExecution<boolean>(
          'Assert',
          queryInputFromPrompt(assertion),
          this.resolveModelRuntime('boolean'),
          serviceOptions,
          this.executionOptions(options, true),
        );

      const pass = Boolean(output);
      const failureMessage = pass
        ? undefined
        : `Assertion failed: ${message || assertionText}\nReason: ${thought || '(no_reason)'}`;

      if (options?.keepRawResponse) {
        return { pass, thought, message: failureMessage };
      }
      if (!pass) {
        throw new Error(failureMessage);
      }
    } catch (error) {
      if (error instanceof TaskExecutionError) {
        const thought = error.task?.thought;
        const diagnosticMessage =
          error.task?.errorMessage || error.cause.message;
        const reason = thought || diagnosticMessage || '(no_reason)';
        const failureMessage = `Assertion failed: ${message || assertionText}\nReason: ${reason}`;

        if (options?.keepRawResponse) {
          return { pass: false, thought, message: failureMessage };
        }
        throw new Error(failureMessage, { cause: error.cause });
      }
      throw error;
    }
  }
}
