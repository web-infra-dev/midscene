import type { TUserPrompt } from '@/ai-model/index';
import type { ModelRuntime } from '@/ai-model/models';
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
import { parsePrompt } from './utils';

const defaultQueryOptions: QueryOptions = {
  domIncluded: false,
  screenshotIncluded: true,
};

type InsightTaskExecutor = Pick<TaskExecutor, 'createTypeQueryExecution'>;

type InsightContextOptions = { context?: string };

/** Execute read-only AI operations against either live or fixed UI context. */
export class Insight implements InsightAPI {
  constructor(
    private readonly taskExecutor: InsightTaskExecutor,
    private readonly resolveModelRuntime: () => ModelRuntime,
    private readonly resolveAgentContext: (
      apiName: AiApiName,
      callContext?: string,
    ) => string | undefined,
    private readonly getUIContext?: () => UIContext,
  ) {}

  private resolveContext(
    apiName: AiApiName,
    options?: InsightContextOptions,
  ): string | undefined {
    return this.resolveAgentContext(apiName, options?.context);
  }

  private withContext<T extends InsightContextOptions>(
    apiName: AiApiName,
    options: T,
  ): T {
    const resolvedContext = this.resolveContext(apiName, options);
    if (resolvedContext === undefined) {
      return options;
    }

    return {
      ...options,
      context: resolvedContext,
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
    const modelRuntime = this.resolveModelRuntime();
    const executionOptions = this.executionOptions();
    const serviceOptions = this.withContext('aiQuery', options);
    const { output } = executionOptions
      ? await this.taskExecutor.createTypeQueryExecution(
          'Query',
          demand,
          modelRuntime,
          serviceOptions,
          undefined,
          executionOptions,
        )
      : await this.taskExecutor.createTypeQueryExecution(
          'Query',
          demand,
          modelRuntime,
          serviceOptions,
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
    const { textPrompt, multimodalPrompt } = parsePrompt(prompt);
    const serviceOptions = this.withContext(apiName, options);
    const { output } = await this.taskExecutor.createTypeQueryExecution(
      type,
      textPrompt,
      this.resolveModelRuntime(),
      serviceOptions,
      multimodalPrompt,
      this.executionOptions(),
    );
    return output as ReturnType;
  }

  async aiAssert(
    assertion: TUserPrompt,
    message?: string,
    options?: AssertOptions,
  ): Promise<AgentAssertResult | undefined> {
    const contextOptions = this.withContext('aiAssert', options ?? {});
    const serviceOptions: QueryOptions = {
      domIncluded: options?.domIncluded ?? defaultQueryOptions.domIncluded,
      screenshotIncluded:
        options?.screenshotIncluded ?? defaultQueryOptions.screenshotIncluded,
      ...(contextOptions.context !== undefined
        ? { context: contextOptions.context }
        : {}),
    };
    const { textPrompt, multimodalPrompt } = parsePrompt(assertion);
    const assertionText =
      typeof assertion === 'string' ? assertion : assertion.prompt;

    try {
      const { output, thought } =
        await this.taskExecutor.createTypeQueryExecution<boolean>(
          'Assert',
          textPrompt,
          this.resolveModelRuntime(),
          serviceOptions,
          multimodalPrompt,
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
