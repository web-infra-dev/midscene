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
import { resolveAssertCallArgs } from './assertion-evidence';
import { TaskExecutionError, type TaskExecutor } from './tasks';
import { parsePrompt } from './utils';

const defaultQueryOptions: QueryOptions = {
  domIncluded: false,
  screenshotIncluded: true,
};

type InsightTaskExecutor = Pick<TaskExecutor, 'createTypeQueryExecution'>;

/** Execute read-only AI operations against either live or fixed UI context. */
export class Insight implements InsightAPI {
  constructor(
    private readonly taskExecutor: InsightTaskExecutor,
    private readonly resolveModelRuntime: () => ModelRuntime,
    private readonly getUIContext?: () => UIContext,
  ) {}

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
    const { output } = executionOptions
      ? await this.taskExecutor.createTypeQueryExecution(
          'Query',
          demand,
          modelRuntime,
          options,
          undefined,
          executionOptions,
        )
      : await this.taskExecutor.createTypeQueryExecution(
          'Query',
          demand,
          modelRuntime,
          options,
        );
    return output as ReturnType;
  }

  async aiBoolean(
    prompt: TUserPrompt,
    options: QueryOptions = defaultQueryOptions,
  ): Promise<boolean> {
    return this.queryPrimitive('Boolean', prompt, options);
  }

  async aiNumber(
    prompt: TUserPrompt,
    options: QueryOptions = defaultQueryOptions,
  ): Promise<number> {
    return this.queryPrimitive('Number', prompt, options);
  }

  async aiString(
    prompt: TUserPrompt,
    options: QueryOptions = defaultQueryOptions,
  ): Promise<string> {
    return this.queryPrimitive('String', prompt, options);
  }

  async aiAsk(
    prompt: TUserPrompt,
    options: QueryOptions = defaultQueryOptions,
  ): Promise<string> {
    return this.aiString(prompt, options);
  }

  private async queryPrimitive<ReturnType>(
    type: 'Boolean' | 'Number' | 'String',
    prompt: TUserPrompt,
    options: QueryOptions,
  ): Promise<ReturnType> {
    const { textPrompt, multimodalPrompt } = parsePrompt(prompt);
    const { output } = await this.taskExecutor.createTypeQueryExecution(
      type,
      textPrompt,
      this.resolveModelRuntime(),
      options,
      multimodalPrompt,
      this.executionOptions(),
    );
    return output as ReturnType;
  }

  async aiAssert(
    assertion: TUserPrompt,
    message?: string | AssertOptions,
    options?: AssertOptions,
  ): Promise<AgentAssertResult | undefined> {
    const resolved = resolveAssertCallArgs(message, options);
    const assertOptions = resolved.options as AssertOptions | undefined;
    const serviceOptions: QueryOptions = {
      domIncluded:
        assertOptions?.domIncluded ?? defaultQueryOptions.domIncluded,
      screenshotIncluded:
        assertOptions?.screenshotIncluded ??
        defaultQueryOptions.screenshotIncluded,
      ...(assertOptions?.context !== undefined
        ? { context: assertOptions.context }
        : {}),
      ...(assertOptions?.deepAssert === undefined
        ? {}
        : { deepAssert: assertOptions.deepAssert }),
      ...(assertOptions?.AssertionContextBoundary === undefined
        ? {}
        : {
            AssertionContextBoundary: assertOptions.AssertionContextBoundary,
          }),
      ...(assertOptions?.BeforeExecutions === undefined
        ? {}
        : { BeforeExecutions: assertOptions.BeforeExecutions }),
      ...(assertOptions?.BeforeTasks === undefined
        ? {}
        : { BeforeTasks: assertOptions.BeforeTasks }),
      ...(assertOptions?.MaxPictures === undefined
        ? {}
        : { MaxPictures: assertOptions.MaxPictures }),
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
          this.executionOptions(assertOptions, true),
        );

      const pass = Boolean(output);
      const failureMessage = pass
        ? undefined
        : `Assertion failed: ${resolved.message || assertionText}\nReason: ${thought || '(no_reason)'}`;

      if (assertOptions?.keepRawResponse) {
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
        const failureMessage = `Assertion failed: ${resolved.message || assertionText}\nReason: ${reason}`;

        if (assertOptions?.keepRawResponse) {
          return { pass: false, thought, message: failureMessage };
        }
        throw new Error(failureMessage, { cause: error.cause });
      }
      throw error;
    }
  }
}
