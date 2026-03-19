import type {
  AIUsageInfo,
  CodeGenerationChunk,
  DeepThinkOption,
  StreamingCallback,
} from '@/types';
import type { IModelConfig } from '@midscene/shared/env';
import { getDebug } from '@midscene/shared/logger';
import { ifInBrowser } from '@midscene/shared/utils';
import type { ChatCompletionMessageParam } from 'openai/resources/index';

const CODEX_PROVIDER_SCHEME = 'codex://';
const CODEX_DEFAULT_TIMEOUT_MS = 10 * 60 * 1000;
const CODEX_DEFAULT_PROCESS_START_TIMEOUT_MS = 15 * 1000;
const CODEX_DEFAULT_CLEANUP_TIMEOUT_MS = 8 * 1000;
const CODEX_TEXT_INPUT_MAX_LENGTH = 256 * 1024;

const debugCodex = getDebug('ai:call:codex');
const warnCodex = getDebug('ai:call:codex', { console: true });

type CodexReasoningEffort = 'low' | 'medium' | 'high' | 'xhigh';

type JsonRpcRequest = {
  id: string | number;
  method: string;
  params?: unknown;
};

type JsonRpcResponse = {
  id: string | number;
  result?: unknown;
  error?: {
    code?: number;
    message?: string;
    data?: unknown;
  };
};

type JsonRpcNotification = {
  method: string;
  params?: Record<string, any>;
};

type JsonRpcMessage = JsonRpcRequest | JsonRpcResponse | JsonRpcNotification;

type CodexTextInput = {
  type: 'text';
  text: string;
  text_elements: any[];
};

type CodexImageInput = {
  type: 'image';
  url: string;
  detail?: string;
};

type CodexLocalImageInput = {
  type: 'localImage';
  path: string;
  detail?: string;
};

type CodexTurnInput = CodexTextInput | CodexImageInput | CodexLocalImageInput;

type CodexTurnResult = {
  content: string;
  reasoning_content?: string;
  usage?: AIUsageInfo;
  isStreamed: boolean;
};

type CodexTurnStartResponse = {
  turn?: {
    id?: string;
  };
};

type CodexThreadStartResponse = {
  thread?: {
    id?: string;
  };
};

type CodexUsageNotification = {
  threadId?: string;
  turnId?: string;
  tokenUsage?: {
    total?: {
      totalTokens?: number;
      inputTokens?: number;
      cachedInputTokens?: number;
      outputTokens?: number;
      reasoningOutputTokens?: number;
    };
    last?: {
      totalTokens?: number;
      inputTokens?: number;
      cachedInputTokens?: number;
      outputTokens?: number;
      reasoningOutputTokens?: number;
    };
  };
};

class SerializedRunner {
  private tail: Promise<void> = Promise.resolve();

  async run<T>(work: () => Promise<T>): Promise<T> {
    const previous = this.tail;
    let release!: () => void;
    this.tail = new Promise<void>((resolve) => {
      release = resolve;
    });

    await previous;
    try {
      return await work();
    } finally {
      release();
    }
  }
}

export const isCodexAppServerProvider = (baseURL?: string): boolean => {
  if (!baseURL) return false;
  return baseURL.trim().toLowerCase().startsWith(CODEX_PROVIDER_SCHEME);
};

const isAbortError = (error: unknown): boolean => {
  if (!error) return false;
  if (error instanceof Error && error.name === 'AbortError') return true;
  const message =
    error instanceof Error ? error.message : String(error ?? 'unknown error');
  return /aborted|abort/i.test(message);
};

const toNonEmptyString = (value: unknown): string | undefined => {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
};

export const normalizeCodexLocalImagePath = (
  imageUrl: string,
  platform: NodeJS.Platform = process.platform,
): string => {
  if (!imageUrl.startsWith('file://')) {
    return imageUrl;
  }

  try {
    const parsed = new URL(imageUrl);
    const pathname = decodeURIComponent(parsed.pathname);
    const host = parsed.hostname.toLowerCase();

    if (platform === 'win32') {
      const windowsPath = pathname
        .replace(/\//g, '\\')
        .replace(/^\\([A-Za-z]:)/, '$1');

      if (host && host !== 'localhost') {
        return `\\\\${parsed.hostname}${windowsPath}`;
      }

      return windowsPath;
    }

    if (host && host !== 'localhost') {
      return `//${parsed.hostname}${pathname}`;
    }

    return pathname;
  } catch {
    return decodeURIComponent(imageUrl.slice('file://'.length));
  }
};

const extractTextFromMessage = (
  message: ChatCompletionMessageParam,
): string => {
  const content = (message as any).content;
  if (typeof content === 'string') {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (!part || typeof part !== 'object') return '';

        if (part.type === 'text' && typeof part.text === 'string') {
          return part.text;
        }

        if (part.type === 'input_text' && typeof part.text === 'string') {
          return part.text;
        }

        return '';
      })
      .filter(Boolean)
      .join('\n');
  }

  return '';
};

const extractImageInputs = (
  message: ChatCompletionMessageParam,
  imageDetailOverride?: string,
): Array<CodexImageInput | CodexLocalImageInput> => {
  const content = (message as any).content;
  if (!Array.isArray(content)) return [];

  const inputs: Array<CodexImageInput | CodexLocalImageInput> = [];
  for (const part of content) {
    if (!part || typeof part !== 'object') continue;

    const partType = String(part.type || '');
    const imageUrl =
      partType === 'image_url'
        ? toNonEmptyString(part.image_url?.url)
        : partType === 'input_image'
          ? toNonEmptyString(part.image_url || part.url)
          : undefined;

    if (!imageUrl) continue;

    // Resolve detail: use override if provided, otherwise extract from the original message part
    const detail =
      imageDetailOverride ||
      toNonEmptyString(part.image_url?.detail) ||
      toNonEmptyString(part.detail);

    if (
      imageUrl.startsWith('/') ||
      imageUrl.startsWith('./') ||
      imageUrl.startsWith('../') ||
      imageUrl.startsWith('file://')
    ) {
      const path = imageUrl.startsWith('file://')
        ? normalizeCodexLocalImagePath(imageUrl)
        : imageUrl;

      inputs.push({
        type: 'localImage',
        path,
        ...(detail ? { detail } : {}),
      });
      continue;
    }

    inputs.push({
      type: 'image',
      url: imageUrl,
      ...(detail ? { detail } : {}),
    });
  }

  return inputs;
};

export const resolveCodexReasoningEffort = ({
  deepThink,
  modelConfig,
}: {
  deepThink?: DeepThinkOption;
  modelConfig: IModelConfig;
}): CodexReasoningEffort | undefined => {
  if (deepThink === true) return 'high';
  if (deepThink === false) return 'low';

  const normalized = modelConfig.reasoningEffort?.trim().toLowerCase();
  if (
    normalized === 'low' ||
    normalized === 'medium' ||
    normalized === 'high' ||
    normalized === 'xhigh'
  ) {
    return normalized;
  }

  if (modelConfig.reasoningEnabled === true) return 'high';
  if (modelConfig.reasoningEnabled === false) return 'low';

  return undefined;
};

export const buildCodexTurnPayloadFromMessages = (
  messages: ChatCompletionMessageParam[],
  options?: { imageDetailOverride?: string },
): {
  developerInstructions?: string;
  input: CodexTurnInput[];
} => {
  const developerInstructionParts: string[] = [];
  const transcriptParts: string[] = [];
  const imageInputs: Array<CodexImageInput | CodexLocalImageInput> = [];

  for (const message of messages) {
    const role = String((message as any).role || 'user');
    const text = extractTextFromMessage(message);

    if (role === 'system') {
      if (text.trim()) developerInstructionParts.push(text.trim());
      continue;
    }

    const roleTag = role.toUpperCase();
    if (text.trim()) {
      transcriptParts.push(`[${roleTag}]\n${text.trim()}`);
    } else {
      transcriptParts.push(`[${roleTag}]\n(no text content)`);
    }

    if (role === 'user') {
      imageInputs.push(
        ...extractImageInputs(message, options?.imageDetailOverride),
      );
    }
  }

  const fullTranscript = transcriptParts.join('\n\n');
  const transcriptText =
    (fullTranscript.length > CODEX_TEXT_INPUT_MAX_LENGTH
      ? fullTranscript.slice(-CODEX_TEXT_INPUT_MAX_LENGTH)
      : fullTranscript) || 'Please answer the latest user request.';

  const input: CodexTurnInput[] = [
    {
      type: 'text',
      text: transcriptText,
      text_elements: [],
    },
    ...imageInputs,
  ];

  const developerInstructions = developerInstructionParts.length
    ? developerInstructionParts.join('\n\n')
    : undefined;

  return {
    developerInstructions,
    input,
  };
};

class CodexAppServerConnection {
  private child: any;
  private lineReader: any;
  private pendingMessages: JsonRpcMessage[] = [];
  private lineBuffer: string[] = [];
  private nextRequestId = 1;
  private closed = false;
  private lastExitCode: number | null = null;
  private processErrorMessage: string | null = null;
  private stderrBuffer = '';

  private constructor(child: any, lineReader: any) {
    this.child = child;
    this.lineReader = lineReader;
  }

  static async create(): Promise<CodexAppServerConnection> {
    if (ifInBrowser) {
      throw new Error(
        'codex app-server provider is not supported in browser runtime',
      );
    }

    const childProcessModuleName = 'node:child_process';
    const readlineModuleName = 'node:readline';
    const { spawn } = await import(childProcessModuleName);
    const readline = await import(readlineModuleName);

    const child = spawn('codex', ['app-server'], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    if (!child.stdin || !child.stdout || !child.stderr) {
      throw new Error('failed to start codex app-server: stdio unavailable');
    }

    const lineReader = readline.createInterface({
      input: child.stdout,
      crlfDelay: Number.POSITIVE_INFINITY,
    });
    const connection = new CodexAppServerConnection(child, lineReader);
    connection.detachFromEventLoop();
    connection.attachProcessListeners();
    await connection.initializeHandshake();

    return connection;
  }

  isClosed(): boolean {
    return this.closed;
  }

  async runTurn({
    messages,
    modelConfig,
    stream,
    onChunk,
    deepThink,
    abortSignal,
  }: {
    messages: ChatCompletionMessageParam[];
    modelConfig: IModelConfig;
    stream?: boolean;
    onChunk?: StreamingCallback;
    deepThink?: DeepThinkOption;
    abortSignal?: AbortSignal;
  }): Promise<CodexTurnResult> {
    const startTime = Date.now();
    const timeoutMs = modelConfig.timeout || CODEX_DEFAULT_TIMEOUT_MS;
    const deadlineAt = Date.now() + timeoutMs;
    const isStreaming = !!(stream && onChunk);

    // For GPT-5.4 models, use "detail": "original" for image inputs to get original resolution
    const imageDetailOverride =
      modelConfig.modelFamily === 'gpt-5.4' ? 'original' : undefined;
    const { developerInstructions, input } = buildCodexTurnPayloadFromMessages(
      messages,
      { imageDetailOverride },
    );
    const effort = resolveCodexReasoningEffort({ deepThink, modelConfig });

    let threadId: string | undefined;
    let turnId: string | undefined;
    let latestErrorMessage: string | undefined;
    let accumulatedText = '';
    let accumulatedReasoning = '';
    let latestUsage: AIUsageInfo | undefined;

    const emitChunk = ({
      content,
      reasoning,
      isComplete,
      usage,
    }: {
      content: string;
      reasoning: string;
      isComplete: boolean;
      usage?: AIUsageInfo;
    }) => {
      if (!isStreaming || !onChunk) return;
      const chunk: CodeGenerationChunk = {
        content,
        reasoning_content: reasoning,
        accumulated: accumulatedText,
        isComplete,
        usage,
      };
      onChunk(chunk);
    };

    try {
      const threadStartResponse = await this.request<CodexThreadStartResponse>({
        method: 'thread/start',
        params: {
          model: modelConfig.modelName,
          cwd: process.cwd(),
          approvalPolicy: 'never',
          sandbox: 'read-only',
          ephemeral: true,
          experimentalRawEvents: false,
          persistExtendedHistory: false,
          developerInstructions: developerInstructions || null,
        },
        deadlineAt,
        abortSignal,
      });

      threadId = threadStartResponse?.thread?.id;
      if (!threadId) {
        throw new Error('thread/start did not return a thread id');
      }

      const turnStartResponse = await this.request<CodexTurnStartResponse>({
        method: 'turn/start',
        params: {
          threadId,
          input,
          effort,
        },
        deadlineAt,
        abortSignal,
      });

      turnId = turnStartResponse?.turn?.id;
      if (!turnId) {
        throw new Error('turn/start did not return a turn id');
      }

      let turnStatus: string | undefined;
      while (!turnStatus) {
        const message = await this.nextMessage({ deadlineAt, abortSignal });

        if (this.isResponseMessage(message)) {
          // No concurrent requests in adapter runtime.
          continue;
        }

        if (this.isRequestMessage(message)) {
          await this.respondToServerRequest(message);
          continue;
        }

        const notification = message as JsonRpcNotification;
        const method = notification.method;
        const params = notification.params || {};

        if (method === 'error') {
          const messageText =
            params.error?.message ||
            params.message ||
            'codex app-server reported turn error';
          latestErrorMessage = String(messageText);
          continue;
        }

        if (
          method === 'item/agentMessage/delta' &&
          params.threadId === threadId &&
          params.turnId === turnId
        ) {
          const delta = String(params.delta || '');
          if (delta) {
            accumulatedText += delta;
            emitChunk({
              content: delta,
              reasoning: '',
              isComplete: false,
            });
          }
          continue;
        }

        if (
          (method === 'item/reasoning/summaryTextDelta' ||
            method === 'item/reasoning/textDelta') &&
          params.threadId === threadId &&
          params.turnId === turnId
        ) {
          const delta = String(params.delta || '');
          if (delta) {
            accumulatedReasoning += delta;
            emitChunk({
              content: '',
              reasoning: delta,
              isComplete: false,
            });
          }
          continue;
        }

        if (
          method === 'item/completed' &&
          params.threadId === threadId &&
          params.turnId === turnId &&
          params.item?.type === 'agentMessage' &&
          typeof params.item?.text === 'string' &&
          !accumulatedText
        ) {
          accumulatedText = params.item.text;
          continue;
        }

        if (
          method === 'thread/tokenUsage/updated' &&
          params.threadId === threadId &&
          params.turnId === turnId
        ) {
          latestUsage = this.mapUsage({
            usage: params as CodexUsageNotification,
            modelConfig,
            turnId,
            startTime,
          });
          continue;
        }

        if (
          method === 'turn/completed' &&
          params.threadId === threadId &&
          params.turn?.id === turnId
        ) {
          turnStatus = String(params.turn.status || '');
          latestErrorMessage =
            params.turn?.error?.message || latestErrorMessage || undefined;
          break;
        }
      }

      if (turnStatus !== 'completed') {
        throw new Error(
          latestErrorMessage ||
            `codex turn finished with status "${turnStatus || 'unknown'}"`,
        );
      }

      if (isStreaming) {
        emitChunk({
          content: '',
          reasoning: '',
          isComplete: true,
          usage: latestUsage,
        });
      }

      return {
        content: accumulatedText,
        reasoning_content: accumulatedReasoning || undefined,
        usage: latestUsage,
        isStreamed: isStreaming,
      };
    } catch (error) {
      if (isAbortError(error) && threadId && turnId) {
        await this.request({
          method: 'turn/interrupt',
          params: {
            threadId,
            turnId,
          },
          deadlineAt: Date.now() + 5_000,
        }).catch(() => {});
      }
      throw error;
    } finally {
      if (threadId) {
        await this.request({
          method: 'thread/unsubscribe',
          params: { threadId },
          deadlineAt: Date.now() + CODEX_DEFAULT_CLEANUP_TIMEOUT_MS,
        }).catch((error) => {
          warnCodex(
            `failed to unsubscribe codex thread ${threadId}: ${String(error)}`,
          );
        });
      }
    }
  }

  async dispose(): Promise<void> {
    if (this.closed) return;
    this.closed = true;

    try {
      this.lineReader?.close?.();
    } catch {}

    try {
      this.child?.stdin?.end?.();
    } catch {}

    try {
      this.child?.kill?.();
    } catch {}
  }

  private attachProcessListeners() {
    this.lineReader.on('line', (line: string) => {
      this.lineBuffer.push(line);
    });

    this.child.stderr.on('data', (chunk: Buffer | string) => {
      const text = Buffer.isBuffer(chunk)
        ? chunk.toString('utf8')
        : String(chunk);
      this.stderrBuffer += text;
      if (this.stderrBuffer.length > 8192) {
        this.stderrBuffer = this.stderrBuffer.slice(-8192);
      }
    });

    this.child.on('exit', (code: number | null) => {
      this.closed = true;
      this.lastExitCode = code;
    });

    this.child.on('error', (error: Error) => {
      this.closed = true;
      this.processErrorMessage = error.message;
    });
  }

  /**
   * Keep codex process reusable but let short-lived callers exit naturally.
   * Without unref, one-shot scripts/tests that call AI once can hang.
   */
  private detachFromEventLoop() {
    this.child.unref?.();
    this.child.stdin?.unref?.();
    this.child.stdout?.unref?.();
    this.child.stderr?.unref?.();
  }

  private async initializeHandshake() {
    const deadlineAt = Date.now() + CODEX_DEFAULT_PROCESS_START_TIMEOUT_MS;
    await this.request({
      method: 'initialize',
      params: {
        clientInfo: {
          name: 'midscene_codex_provider',
          title: 'Midscene Codex Provider',
          version: '1.0.0',
        },
        capabilities: {
          experimentalApi: false,
        },
      },
      deadlineAt,
    });
    await this.sendMessage({
      method: 'initialized',
    });
  }

  private mapUsage({
    usage,
    modelConfig,
    turnId,
    startTime,
  }: {
    usage: CodexUsageNotification;
    modelConfig: IModelConfig;
    turnId: string;
    startTime: number;
  }): AIUsageInfo | undefined {
    const tokenUsage = usage.tokenUsage;
    const picked = tokenUsage?.last || tokenUsage?.total;
    if (!picked) return undefined;

    return {
      prompt_tokens: picked.inputTokens ?? 0,
      completion_tokens: picked.outputTokens ?? 0,
      total_tokens: picked.totalTokens ?? 0,
      cached_input: picked.cachedInputTokens ?? 0,
      time_cost: Date.now() - startTime,
      model_name: modelConfig.modelName,
      model_description: modelConfig.modelDescription,
      intent: modelConfig.intent,
      request_id: turnId,
    } satisfies AIUsageInfo;
  }

  private isRequestMessage(message: JsonRpcMessage): message is JsonRpcRequest {
    return (
      typeof (message as any)?.method === 'string' &&
      (message as any)?.id !== undefined
    );
  }

  private isResponseMessage(
    message: JsonRpcMessage,
  ): message is JsonRpcResponse {
    return (
      (message as any)?.id !== undefined &&
      ((message as any)?.result !== undefined ||
        (message as any)?.error !== undefined) &&
      typeof (message as any)?.method !== 'string'
    );
  }

  private async request<T = unknown>({
    method,
    params,
    deadlineAt,
    abortSignal,
  }: {
    method: string;
    params: unknown;
    deadlineAt?: number;
    abortSignal?: AbortSignal;
  }): Promise<T> {
    const requestId = this.nextRequestId++;

    await this.sendMessage({
      id: requestId,
      method,
      params,
    });

    while (true) {
      const message = await this.nextMessage({
        deadlineAt,
        abortSignal,
        includePending: false,
      });

      if (this.isResponseMessage(message) && message.id === requestId) {
        if (message.error) {
          throw new Error(
            `codex app-server ${method} failed: ${
              message.error.message || 'unknown error'
            }`,
          );
        }
        return (message.result || {}) as T;
      }

      if (this.isRequestMessage(message)) {
        await this.respondToServerRequest(message);
        continue;
      }

      // Keep unmatched notifications/other responses for later stream handling.
      this.pendingMessages.push(message);
    }
  }

  private async respondToServerRequest(request: JsonRpcRequest): Promise<void> {
    const requestId = request.id;
    const method = request.method;

    let result: unknown = {};
    if (method === 'item/commandExecution/requestApproval') {
      result = { decision: 'decline' };
    } else if (method === 'item/fileChange/requestApproval') {
      result = { decision: 'decline' };
    } else if (method === 'mcpServer/elicitation/request') {
      result = { action: 'cancel', content: null };
    } else if (method === 'item/tool/requestUserInput') {
      result = { answers: [] };
    } else {
      await this.sendMessage({
        id: requestId,
        error: {
          code: -32601,
          message: `unsupported server request: ${method}`,
        },
      });
      return;
    }

    await this.sendMessage({
      id: requestId,
      result,
    });
  }

  private async nextMessage({
    deadlineAt,
    abortSignal,
    includePending = true,
  }: {
    deadlineAt?: number;
    abortSignal?: AbortSignal;
    includePending?: boolean;
  }): Promise<JsonRpcMessage> {
    if (includePending && this.pendingMessages.length) {
      return this.pendingMessages.shift() as JsonRpcMessage;
    }

    while (true) {
      if (abortSignal?.aborted) {
        throw new Error('codex app-server request aborted');
      }

      if (deadlineAt && Date.now() > deadlineAt) {
        throw new Error('codex app-server request timed out');
      }

      if (this.lineBuffer.length) {
        const line = this.lineBuffer.shift()!;
        const trimmed = line.trim();
        if (!trimmed) continue;

        let parsed: JsonRpcMessage;
        try {
          parsed = JSON.parse(trimmed);
        } catch (error) {
          warnCodex(
            `ignored non-JSON message from codex app-server: ${trimmed}`,
          );
          continue;
        }

        return parsed;
      }

      if (this.closed) {
        throw this.createClosedConnectionError();
      }

      await new Promise((resolve) => setTimeout(resolve, 20));
    }
  }

  private async sendMessage(payload: Record<string, unknown>): Promise<void> {
    if (this.closed) {
      throw this.createClosedConnectionError();
    }

    const line = JSON.stringify(payload);
    await new Promise<void>((resolve, reject) => {
      this.child.stdin.write(`${line}\n`, (error: Error | null | undefined) => {
        if (error) {
          reject(
            new Error(
              `failed writing to codex app-server stdin: ${error.message}`,
            ),
          );
          return;
        }
        resolve();
      });
    });
  }

  private createClosedConnectionError(): Error {
    const stderr = this.stderrBuffer.trim();
    if (this.processErrorMessage) {
      return new Error(
        stderr
          ? `codex app-server process error: ${this.processErrorMessage}. stderr=${stderr}`
          : `codex app-server process error: ${this.processErrorMessage}`,
      );
    }

    return new Error(
      stderr
        ? `codex app-server connection closed (exitCode=${this.lastExitCode}). stderr=${stderr}`
        : `codex app-server connection closed (exitCode=${this.lastExitCode})`,
    );
  }
}

class CodexAppServerConnectionManager {
  private connection: CodexAppServerConnection | null = null;
  private runner = new SerializedRunner();

  async runTurn({
    messages,
    modelConfig,
    stream,
    onChunk,
    deepThink,
    abortSignal,
  }: {
    messages: ChatCompletionMessageParam[];
    modelConfig: IModelConfig;
    stream?: boolean;
    onChunk?: StreamingCallback;
    deepThink?: DeepThinkOption;
    abortSignal?: AbortSignal;
  }): Promise<CodexTurnResult> {
    return this.runner.run(async () => {
      const connection = await this.getConnection();
      try {
        return await connection.runTurn({
          messages,
          modelConfig,
          stream,
          onChunk,
          deepThink,
          abortSignal,
        });
      } catch (error) {
        if (connection.isClosed() || !isAbortError(error)) {
          await this.resetConnection();
        }
        throw error;
      }
    });
  }

  async shutdownForTests(): Promise<void> {
    await this.resetConnection();
  }

  private async getConnection(): Promise<CodexAppServerConnection> {
    if (!this.connection || this.connection.isClosed()) {
      this.connection = await CodexAppServerConnection.create();
      debugCodex('started long-lived codex app-server connection');
    }
    return this.connection;
  }

  private async resetConnection(): Promise<void> {
    if (!this.connection) return;
    const staleConnection = this.connection;
    this.connection = null;
    await staleConnection.dispose();
    debugCodex('reset codex app-server connection');
  }
}

const codexConnectionManager = new CodexAppServerConnectionManager();

export async function callAIWithCodexAppServer(
  messages: ChatCompletionMessageParam[],
  modelConfig: IModelConfig,
  options?: {
    stream?: boolean;
    onChunk?: StreamingCallback;
    deepThink?: DeepThinkOption;
    abortSignal?: AbortSignal;
  },
): Promise<CodexTurnResult> {
  if (ifInBrowser) {
    throw new Error(
      'codex app-server provider is not supported in browser runtime',
    );
  }

  return codexConnectionManager.runTurn({
    messages,
    modelConfig,
    stream: options?.stream,
    onChunk: options?.onChunk,
    deepThink: options?.deepThink,
    abortSignal: options?.abortSignal,
  });
}

export async function __shutdownCodexAppServerForTests() {
  await codexConnectionManager.shutdownForTests();
}
