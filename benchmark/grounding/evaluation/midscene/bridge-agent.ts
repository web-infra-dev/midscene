import { access } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import sharp from 'sharp';
import type { StoredModelRecord } from '../types.js';
import { defaultMidsceneRepoPath, resolveMidsceneRepoPath } from './paths.js';
import type {
  MidsceneLocateImplementation,
  MidsceneLocateResult,
  MidsceneResultsModelRecord,
} from './types.js';

type MidsceneAgentInstance = {
  aiLocate: (
    prompt: string,
    options?: {
      deepLocate?: boolean;
    },
  ) => Promise<unknown>;
  aiAct: (
    taskPrompt: string,
    options?: {
      deepLocate?: boolean;
      deepThink?: boolean;
      cacheable?: boolean;
    },
  ) => Promise<string | undefined>;
  reportFile?: string | null;
};

type MidsceneAgentConstructor = new (
  device: MidsceneEvaluationDevice,
  options?: Record<string, unknown>,
) => MidsceneAgentInstance;

type MidsceneCoreModule = {
  Agent?: MidsceneAgentConstructor;
  z?: {
    object: (shape: Record<string, unknown>) => unknown;
  };
  getMidsceneLocationSchema?: () => {
    describe: (description: string) => unknown;
  };
};

type MidsceneLocateElement = {
  rect?: {
    left: number;
    top: number;
    width: number;
    height: number;
  } | null;
  point?: [number, number] | { x: number; y: number } | null;
  center?: [number, number] | null;
  dpr?: number;
};

function cloneJsonValue<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

class MidsceneEvaluationDevice {
  interfaceType = 'static';
  protected currentSize = { width: 1, height: 1 };
  protected currentBase64 = '';

  actionSpace(): unknown[] {
    return [];
  }

  describe(): string {
    return 'this is a grounding locate evaluation device';
  }

  async size(): Promise<{ width: number; height: number }> {
    return this.currentSize;
  }

  async screenshotBase64(): Promise<string> {
    return this.currentBase64;
  }

  setShotInfo(size: { width: number; height: number }, base64: string): void {
    this.currentSize = size;
    this.currentBase64 = base64;
  }
}

class MidsceneAiActCaptureDevice extends MidsceneEvaluationDevice {
  private readonly tapAction: unknown;
  private capturedTapLocate: MidsceneLocateElement | null = null;

  constructor(coreModule: MidsceneCoreModule) {
    super();
    const z = coreModule.z;
    const getMidsceneLocationSchema = coreModule.getMidsceneLocationSchema;
    if (!z || typeof z.object !== 'function' || !getMidsceneLocationSchema) {
      throw new Error(
        'Midscene core module 未导出 z 或 getMidsceneLocationSchema',
      );
    }

    this.tapAction = {
      name: 'Tap',
      description: 'Tap the element',
      interfaceAlias: 'aiTap',
      paramSchema: z.object({
        locate: getMidsceneLocationSchema().describe(
          'The element to be tapped',
        ),
      }),
      sample: {
        locate: { prompt: 'the "Submit" button' },
      },
      call: async () => {},
    };
  }

  actionSpace(): unknown[] {
    return [this.tapAction];
  }

  async beforeInvokeAction(actionName: string, param: unknown): Promise<void> {
    if (
      actionName === 'Tap' &&
      !this.capturedTapLocate &&
      param &&
      typeof param === 'object' &&
      'locate' in param
    ) {
      this.capturedTapLocate = cloneJsonValue(
        (param as { locate: MidsceneLocateElement }).locate,
      );
    }
  }

  resetCapture(): void {
    this.capturedTapLocate = null;
  }

  consumeCapturedTapLocate(): MidsceneLocateElement | null {
    const captured = this.capturedTapLocate;
    this.capturedTapLocate = null;
    return captured;
  }
}

function rectToBbox(
  rect?: {
    left: number;
    top: number;
    width: number;
    height: number;
  } | null,
): [number, number, number, number] | null {
  if (!rect) {
    return null;
  }

  return [
    rect.left,
    rect.top,
    rect.left + rect.width - 1,
    rect.top + rect.height - 1,
  ];
}

function normalizePoint(
  point?: [number, number] | { x: number; y: number } | null,
): [number, number] | null {
  if (
    Array.isArray(point) &&
    point.length === 2 &&
    point.every((value) => typeof value === 'number' && Number.isFinite(value))
  ) {
    return point;
  }

  if (
    point &&
    typeof point === 'object' &&
    !Array.isArray(point) &&
    typeof point.x === 'number' &&
    Number.isFinite(point.x) &&
    typeof point.y === 'number' &&
    Number.isFinite(point.y)
  ) {
    return [point.x, point.y];
  }

  return null;
}

function locateElementToLocateResult(
  element: MidsceneLocateElement | null | undefined,
): MidsceneLocateResult {
  const point = normalizePoint(element?.point);
  return {
    raw: element ?? null,
    bbox: rectToBbox(element?.rect),
    center: element?.center || point,
  };
}

function buildAiActTaskPrompt(prompt: string): string {
  return `点击${prompt}`;
}

function isReplanningCycleLimitExceededError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  return (
    error.message.includes('Replanned 0 times, exceeding the limit.') &&
    error.message.includes('replanningCycleLimit')
  );
}

async function ensureFileExists(filePath: string): Promise<void> {
  try {
    await access(filePath);
  } catch {
    throw new Error(
      `未找到 Midscene 构建产物: ${filePath}。请先在 ${path.dirname(
        path.dirname(path.dirname(filePath)),
      )} 中安装依赖并完成构建。`,
    );
  }
}

function resolveMidsceneModuleEntry(input: {
  repoPath?: string;
  moduleEntryFile?: string;
}): string {
  if (input.moduleEntryFile) {
    return path.resolve(input.moduleEntryFile);
  }

  const repoPath = resolveMidsceneRepoPath(
    input.repoPath || defaultMidsceneRepoPath,
  );
  return path.join(repoPath, 'packages/core/dist/es/index.mjs');
}

async function loadMidsceneCoreModule(input: {
  repoPath?: string;
  moduleEntryFile?: string;
}): Promise<MidsceneCoreModule> {
  const entryFile = resolveMidsceneModuleEntry(input);
  await ensureFileExists(entryFile);

  return (await import(pathToFileURL(entryFile).href)) as MidsceneCoreModule;
}

async function loadMidsceneAgentConstructor(input: {
  repoPath?: string;
  moduleEntryFile?: string;
}): Promise<{
  AgentCtor: MidsceneAgentConstructor;
  coreModule: MidsceneCoreModule;
}> {
  const coreModule = await loadMidsceneCoreModule(input);
  const AgentCtor = coreModule.Agent as MidsceneAgentConstructor | undefined;
  if (!AgentCtor) {
    const entryFile = resolveMidsceneModuleEntry(input);
    throw new Error(`无法从 ${entryFile} 加载 Midscene Agent 构造函数`);
  }

  return { AgentCtor, coreModule };
}

export function buildMidsceneModelConfig(
  model: StoredModelRecord,
  options: {
    reasoningEnabled?: boolean;
  } = {},
): MidsceneResultsModelRecord['modelConfig'] & Record<string, string> {
  const config: MidsceneResultsModelRecord['modelConfig'] &
    Record<string, string> = {
    MIDSCENE_MODEL_NAME: model.name,
    MIDSCENE_MODEL_BASE_URL: model.baseUrl,
    MIDSCENE_MODEL_API_KEY: model.apiKey,
    MIDSCENE_MODEL_FAMILY: model.family,
  };

  if (typeof options.reasoningEnabled === 'boolean') {
    config.MIDSCENE_MODEL_REASONING_ENABLED = options.reasoningEnabled
      ? 'true'
      : 'false';
  }

  if (model.apiType === 'responses') {
    config.MIDSCENE_MODEL_API_TYPE = 'responses';
  }

  return config;
}

export async function createMidsceneLocateAgent(input: {
  model: StoredModelRecord;
  modelConfigOptions?: {
    reasoningEnabled?: boolean;
  };
  repoPath?: string;
  moduleEntryFile?: string;
  reportFileName?: string;
}): Promise<{
  setShot: (screenshotPath: string) => Promise<void>;
  aiLocate: (
    prompt: string,
    options?: {
      deepLocate?: boolean;
    },
  ) => Promise<MidsceneLocateResult>;
  readonly reportFile: string | null;
}> {
  const { AgentCtor } = await loadMidsceneAgentConstructor(input);
  const device = new MidsceneEvaluationDevice();
  const agent = new AgentCtor(device, {
    modelConfig: buildMidsceneModelConfig(
      input.model,
      input.modelConfigOptions,
    ),
    generateReport: false,
    reportFileName: input.reportFileName,
  });

  return {
    async setShot(screenshotPath: string): Promise<void> {
      const image = sharp(screenshotPath);
      const metadata = await image.metadata();

      if (!metadata.width || !metadata.height) {
        throw new Error(`无法读取图片尺寸: ${screenshotPath}`);
      }

      const imageBuffer = await image.toBuffer();
      const imageBase64 = imageBuffer.toString('base64');
      const mimeType = metadata.format
        ? `image/${metadata.format}`
        : 'image/png';
      const base64WithPrefix = `data:${mimeType};base64,${imageBase64}`;

      device.setShotInfo(
        { width: metadata.width, height: metadata.height },
        base64WithPrefix,
      );
    },
    async aiLocate(
      prompt: string,
      options = {},
    ): Promise<MidsceneLocateResult> {
      const raw = (await agent
        .aiLocate(prompt, {
          deepLocate: options.deepLocate,
        })
        .catch((error: unknown) => {
          if (
            error &&
            typeof error === 'object' &&
            (error as { locateOutcome?: unknown }).locateOutcome === 'not-found'
          ) {
            return {
              locateOutcome: 'not-found' as const,
              rawResponse: (error as { locateRawResponse?: unknown })
                .locateRawResponse,
            };
          }
          throw error;
        })) as {
        locateOutcome?: 'not-found';
        rawResponse?: string;
        rect?: {
          left: number;
          top: number;
          width: number;
          height: number;
        };
        point?: [number, number] | { x: number; y: number };
        center?: [number, number];
      };
      if (raw.locateOutcome === 'not-found') {
        return {
          raw,
          bbox: null,
          center: null,
          outcome: 'not-found',
        };
      }
      const point = normalizePoint(raw.point);

      return {
        raw,
        bbox: rectToBbox(raw.rect),
        center: raw.center || point,
        outcome: 'located',
      };
    },
    get reportFile(): string | null {
      return agent.reportFile || null;
    },
  };
}

export async function createMidsceneAiActTapAgent(input: {
  model: StoredModelRecord;
  modelConfigOptions?: {
    reasoningEnabled?: boolean;
  };
  repoPath?: string;
  moduleEntryFile?: string;
  reportFileName?: string;
}): Promise<{
  setShot: (screenshotPath: string) => Promise<void>;
  aiActTapLocate: (
    taskPrompt: string,
    options?: {
      deepLocate?: boolean;
      deepThink?: boolean;
    },
  ) => Promise<{
    taskPrompt: string;
    locateResult: MidsceneLocateResult;
  }>;
  readonly reportFile: string | null;
}> {
  const { AgentCtor, coreModule } = await loadMidsceneAgentConstructor(input);
  const device = new MidsceneAiActCaptureDevice(coreModule);
  const agent = new AgentCtor(device, {
    modelConfig: buildMidsceneModelConfig(
      input.model,
      input.modelConfigOptions,
    ),
    generateReport: false,
    reportFileName: input.reportFileName,
    replanningCycleLimit: 0,
  });

  return {
    async setShot(screenshotPath: string): Promise<void> {
      const image = sharp(screenshotPath);
      const metadata = await image.metadata();

      if (!metadata.width || !metadata.height) {
        throw new Error(`无法读取图片尺寸: ${screenshotPath}`);
      }

      const imageBuffer = await image.toBuffer();
      const imageBase64 = imageBuffer.toString('base64');
      const mimeType = metadata.format
        ? `image/${metadata.format}`
        : 'image/png';
      const base64WithPrefix = `data:${mimeType};base64,${imageBase64}`;

      device.setShotInfo(
        { width: metadata.width, height: metadata.height },
        base64WithPrefix,
      );
    },
    async aiActTapLocate(taskPrompt: string, options = {}) {
      device.resetCapture();

      try {
        await agent.aiAct(taskPrompt, {
          deepLocate: options.deepLocate,
          deepThink: options.deepThink,
          cacheable: false,
        });
      } catch (error) {
        if (!isReplanningCycleLimitExceededError(error)) {
          throw error;
        }
      }

      const capturedTapLocate = device.consumeCapturedTapLocate();
      const locateResult = capturedTapLocate
        ? locateElementToLocateResult(capturedTapLocate)
        : null;

      if (!locateResult) {
        throw new Error('aiAct 未捕获到 Tap 对应的定位结果');
      }

      return {
        taskPrompt,
        locateResult,
      };
    },
    get reportFile(): string | null {
      return agent.reportFile || null;
    },
  };
}

export async function createMidsceneEvaluationAgent(input: {
  model: StoredModelRecord;
  modelConfigOptions?: {
    reasoningEnabled?: boolean;
  };
  locateImplementation: MidsceneLocateImplementation;
  repoPath?: string;
  moduleEntryFile?: string;
  reportFileName?: string;
}): Promise<{
  setShot: (screenshotPath: string) => Promise<void>;
  locate: (
    prompt: string,
    options?: {
      deepLocate?: boolean;
      deepThink?: boolean;
    },
  ) => Promise<MidsceneLocateResult>;
  readonly reportFile: string | null;
}> {
  if (input.locateImplementation === 'aiAct') {
    const aiActAgent = await createMidsceneAiActTapAgent(input);
    return {
      setShot: aiActAgent.setShot,
      async locate(
        prompt: string,
        options = {},
      ): Promise<MidsceneLocateResult> {
        const { locateResult } = await aiActAgent.aiActTapLocate(
          buildAiActTaskPrompt(prompt),
          options,
        );
        return locateResult;
      },
      get reportFile(): string | null {
        return aiActAgent.reportFile;
      },
    };
  }

  const locateAgent = await createMidsceneLocateAgent(input);
  return {
    setShot: locateAgent.setShot,
    locate: locateAgent.aiLocate,
    get reportFile(): string | null {
      return locateAgent.reportFile;
    },
  };
}
