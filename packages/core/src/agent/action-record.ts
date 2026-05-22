import type { TMultimodalPrompt, TUserPrompt } from '@/common';
import { TaskExecutionError } from '@/task-runner';
import type {
  ActionRecordDump,
  ActionRecord as ActionRecordInterface,
  ActionRecordSource,
  AgentAssertOpt,
  ServiceExtractOption,
  ServiceExtractParam,
  UIContext,
} from '@/types';
import { parsePrompt } from './utils';

const recordFramePromptPrefix =
  'Use the recorded action frames provided in this request. The current screenshot is record frame #1, and the reference images named record-frame-* are later frames from the same action. Evaluate the user request across all provided frames, not only the final page state.';

export type ActionRecordInsightType =
  | 'Query'
  | 'Boolean'
  | 'Number'
  | 'String'
  | 'Assert';

export type ActionRecordInsightRunner = <T>(
  record: ActionRecordDump,
  type: ActionRecordInsightType,
  demand: ServiceExtractParam,
  opt?: ServiceExtractOption,
  multimodalPrompt?: TMultimodalPrompt,
  reportDemand?: ServiceExtractParam,
) => Promise<{ output: T; thought?: string }>;

function withRecordFramePrompt(
  demand: ServiceExtractParam,
): ServiceExtractParam {
  if (typeof demand === 'string') {
    return `${recordFramePromptPrefix}\n\n${demand}`;
  }

  return Object.fromEntries(
    Object.entries(demand).map(([key, value]) => [
      key,
      `${recordFramePromptPrefix}\n\n${value}`,
    ]),
  );
}

function mergeRecordFramesAsPrompt(
  record: ActionRecordDump,
  multimodalPrompt?: TMultimodalPrompt,
): TMultimodalPrompt | undefined {
  const frameImages = record.frames.slice(1).map((frame, index) => ({
    name: `record-frame-${index + 2}-offset-${frame.offset}ms`,
    url: frame.screenshot.base64,
  }));

  const userImages = multimodalPrompt?.images ?? [];
  const images = [...frameImages, ...userImages];
  if (!images.length) {
    return multimodalPrompt;
  }

  return {
    images,
    convertHttpImage2Base64: multimodalPrompt?.convertHttpImage2Base64,
  };
}

export function recordDumpToUIContext(record: ActionRecordDump): UIContext {
  const firstFrame = record.frames[0];
  if (!firstFrame) {
    throw new Error(
      `ActionRecord ${record.id} has no frames. Cannot run record insight APIs.`,
    );
  }

  return {
    screenshot: firstFrame.screenshot,
    shotSize: record.shotSize,
    shrunkShotToLogicalRatio: record.shrunkShotToLogicalRatio,
    deprecatedDpr: record.deprecatedDpr,
  } as UIContext;
}

export function recordDumpToSource(
  record: ActionRecordDump,
): ActionRecordSource {
  return {
    recordId: record.id,
    actionTaskId: record.actionTaskId,
    actionTitle: record.actionTitle,
    frameIds: record.frames.map((frame) => frame.id),
  };
}

export class ActionRecord implements ActionRecordInterface {
  readonly id: string;
  readonly actionTaskId: string;
  readonly actionName: string;
  readonly actionTitle?: string;
  readonly startedAt: number;
  readonly endedAt: number;
  readonly interval: number;
  readonly maxCount: number;
  readonly shotSize: ActionRecordDump['shotSize'];
  readonly shrunkShotToLogicalRatio: number;
  readonly deprecatedDpr?: number;
  readonly warnings?: string[];
  readonly frames: ActionRecordDump['frames'];

  constructor(
    dump: ActionRecordDump,
    private readonly runInsight: ActionRecordInsightRunner,
  ) {
    this.id = dump.id;
    this.actionTaskId = dump.actionTaskId;
    this.actionName = dump.actionName;
    this.actionTitle = dump.actionTitle;
    this.startedAt = dump.startedAt;
    this.endedAt = dump.endedAt;
    this.interval = dump.interval;
    this.maxCount = dump.maxCount;
    this.shotSize = dump.shotSize;
    this.shrunkShotToLogicalRatio = dump.shrunkShotToLogicalRatio;
    this.deprecatedDpr = dump.deprecatedDpr;
    this.warnings = dump.warnings;
    this.frames = dump.frames;
  }

  private get dump(): ActionRecordDump {
    return this.toJSON();
  }

  private async runRecordInsight<T>(
    type: ActionRecordInsightType,
    demand: ServiceExtractParam,
    opt?: ServiceExtractOption,
    multimodalPrompt?: TMultimodalPrompt,
  ): Promise<{ output: T; thought?: string }> {
    if (!this.frames.length) {
      throw new Error(
        `ActionRecord ${this.id} has no frames. Cannot run record insight APIs.`,
      );
    }

    return this.runInsight<T>(
      this.dump,
      type,
      withRecordFramePrompt(demand),
      opt,
      mergeRecordFramesAsPrompt(this.dump, multimodalPrompt),
      demand,
    );
  }

  async aiQuery<ReturnType = any>(
    demand: ServiceExtractParam,
    opt?: ServiceExtractOption,
  ): Promise<ReturnType> {
    const { output } = await this.runRecordInsight<ReturnType>(
      'Query',
      demand,
      opt,
    );
    return output;
  }

  async aiBoolean(
    prompt: TUserPrompt,
    opt?: ServiceExtractOption,
  ): Promise<boolean> {
    const { textPrompt, multimodalPrompt } = parsePrompt(prompt);
    const { output } = await this.runRecordInsight<boolean>(
      'Boolean',
      textPrompt,
      opt,
      multimodalPrompt,
    );
    return output;
  }

  async aiNumber(
    prompt: TUserPrompt,
    opt?: ServiceExtractOption,
  ): Promise<number> {
    const { textPrompt, multimodalPrompt } = parsePrompt(prompt);
    const { output } = await this.runRecordInsight<number>(
      'Number',
      textPrompt,
      opt,
      multimodalPrompt,
    );
    return output;
  }

  async aiString(
    prompt: TUserPrompt,
    opt?: ServiceExtractOption,
  ): Promise<string> {
    const { textPrompt, multimodalPrompt } = parsePrompt(prompt);
    const { output } = await this.runRecordInsight<string>(
      'String',
      textPrompt,
      opt,
      multimodalPrompt,
    );
    return output;
  }

  async aiAsk(
    prompt: TUserPrompt,
    opt?: ServiceExtractOption,
  ): Promise<string> {
    return this.aiString(prompt, opt);
  }

  async aiAssert(
    assertion: TUserPrompt,
    msg?: string,
    opt?: AgentAssertOpt & ServiceExtractOption,
  ) {
    const { textPrompt, multimodalPrompt } = parsePrompt(assertion);
    const assertionText =
      typeof assertion === 'string' ? assertion : assertion.prompt;

    try {
      const { output, thought } = await this.runRecordInsight<boolean>(
        'Assert',
        textPrompt,
        opt,
        multimodalPrompt,
      );

      const pass = Boolean(output);
      const message = pass
        ? undefined
        : `Assertion failed: ${msg || assertionText}\nReason: ${thought || '(no_reason)'}`;

      if (opt?.keepRawResponse) {
        return {
          pass,
          thought,
          message,
        };
      }

      if (!pass) {
        throw new Error(message);
      }
    } catch (error) {
      if (error instanceof TaskExecutionError) {
        const errorTask = error.errorTask;
        const thought = errorTask?.thought;
        const rawError = errorTask?.error;
        const rawMessage =
          errorTask?.errorMessage ||
          (rawError instanceof Error
            ? rawError.message
            : rawError
              ? String(rawError)
              : undefined);
        const reason = thought || rawMessage || '(no_reason)';
        const message = `Assertion failed: ${msg || assertionText}\nReason: ${reason}`;

        if (opt?.keepRawResponse) {
          return {
            pass: false,
            thought,
            message,
          };
        }

        throw new Error(message, {
          cause: rawError ?? error,
        });
      }

      throw error;
    }
  }

  toJSON(): ActionRecordDump {
    return {
      id: this.id,
      actionTaskId: this.actionTaskId,
      actionName: this.actionName,
      actionTitle: this.actionTitle,
      startedAt: this.startedAt,
      endedAt: this.endedAt,
      interval: this.interval,
      maxCount: this.maxCount,
      shotSize: this.shotSize,
      shrunkShotToLogicalRatio: this.shrunkShotToLogicalRatio,
      deprecatedDpr: this.deprecatedDpr,
      warnings: this.warnings,
      frames: this.frames,
    };
  }
}
