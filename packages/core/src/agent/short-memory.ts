import type { AbstractInterface } from '@/device';
import type { ModelConfigManager } from '@midscene/shared/env';
import { assert } from '@midscene/shared/utils';
import { z } from 'zod';
import { defineAction } from '../device';
import type {
  DeviceAction,
  LocateOption,
  LocateResultElement,
  Rect,
  TUserPrompt,
  UIContext,
} from '../index';
import type { Service } from '../index';
import { buildDetailedLocateParam } from '../yaml/index';

export type ShortMemoryTokenPoint = [number, number];

export type ShortMemoryOpt = LocateOption & {
  /**
   * Max concurrent locate requests.
   * Default: Infinity (fire all in parallel).
   */
  concurrency?: number;
  /**
   * Freeze UI context once, then reuse it for all locate calls.
   * Default: true.
   */
  freezeContext?: boolean;
  /**
   * If true, store the locate results into a short-term in-memory map
   * so later ai()/aiAction() can reuse it to do fast continuous taps.
   */
  useShortMemory?: boolean;
  /**
   * If true, clear existing shot memory before saving.
   * Default: true when useShortMemory is true.
   */
  clearShortMemory?: boolean;
};

export class ShortMemoryManager {
  private points: Record<string, ShortMemoryTokenPoint> = {};

  constructor(
    private deps: {
      interfaceInstance: AbstractInterface;
      service: Service;
      modelConfigManager: ModelConfigManager;
      locateAll: (
        prompts: TUserPrompt | TUserPrompt[],
        opt?: LocateOption & { freezeContext?: boolean },
      ) => Promise<
        Array<{ rect?: Rect; center?: [number, number]; dpr?: number }>
      >;
      getFrozenUIContext: () => UIContext | undefined;
      freezePageContext: () => Promise<void>;
      unfreezePageContext: () => Promise<void>;
    },
  ) {}

  getPoints(): Record<string, ShortMemoryTokenPoint> {
    return this.points;
  }

  setPoints(points: Record<string, ShortMemoryTokenPoint>) {
    this.points = { ...points };
  }

  clearPoints() {
    this.points = {};
  }

  getPointCount(): number {
    return Object.keys(this.points).length;
  }

  buildAiContext(): string | undefined {
    return buildShortMemoryAiContext({
      points: this.points,
    });
  }

  getActionSpace(): DeviceAction[] {
    return [
      defineActionTapWithShortMemory({
        interfaceInstance: this.deps.interfaceInstance,
        getPoints: () => this.points,
      }),
      defineActionClearShortMemory({
        clearPoints: () => this.clearPoints(),
        getPointCount: () => this.getPointCount(),
      }),
      defineActionInputWithShortMemory({
        interfaceInstance: this.deps.interfaceInstance,
        getPoints: () => this.points,
      }),
      defineActionHoverWithShortMemory({
        interfaceInstance: this.deps.interfaceInstance,
        getPoints: () => this.points,
      }),
      defineActionRightClickWithShortMemory({
        interfaceInstance: this.deps.interfaceInstance,
        getPoints: () => this.points,
      }),
      defineActionDoubleClickWithShortMemory({
        interfaceInstance: this.deps.interfaceInstance,
        getPoints: () => this.points,
      }),
      defineActionWarmupShortMemory({
        warmupShortMemory: (param, context) =>
          warmupShortMemory(param, context, {
            service: this.deps.service,
            modelConfigManager: this.deps.modelConfigManager,
            locateAll: this.deps.locateAll,
            getFrozenUIContext: this.deps.getFrozenUIContext,
            freezePageContext: this.deps.freezePageContext,
            unfreezePageContext: this.deps.unfreezePageContext,
            getPoints: () => this.points,
            setPoints: (points) => this.setPoints(points),
          }),
        getPointCount: () => this.getPointCount(),
      }),
    ];
  }
}

const warmupShortMemoryTargetSchema = z.union([
  z.string().describe('Target element description'),
  z
    .object({
      prompt: z.string().describe('Target element description'),
      mode: z
        .enum(['single', 'all'])
        .optional()
        .describe(
          'single = locate one match; all = locate all matches on screen',
        ),
    })
    .describe('Target element with explicit matching mode'),
]);

export const warmupShortMemoryParamSchema = z.object({
  targets: z
    .array(warmupShortMemoryTargetSchema)
    .min(1)
    .describe('Targets to pre-locate and cache into short-term memory'),
  freezeContext: z
    .boolean()
    .optional()
    .describe('Freeze UI context during warmup. Default is true.'),
  clearShortMemory: z
    .boolean()
    .optional()
    .describe('Clear existing shot memory before saving. Default is true.'),
});

export type WarmupShortMemoryParam = z.infer<
  typeof warmupShortMemoryParamSchema
>;

export const tapWithShortMemoryParamSchema = z.object({
  tokens: z
    .array(z.string())
    .min(1)
    .describe(
      'Tokens to tap in order. Example for dial keypad: ["1","3",...].',
    ),
  intervalMs: z
    .number()
    .int()
    .min(0)
    .optional()
    .describe(
      'Delay between taps in ms. Default is adaptive. Use >=1000ms if each tap triggers a network request or the app misses taps.',
    ),
  strict: z
    .boolean()
    .optional()
    .describe(
      'If true, throw error when any token is missing. Default is true.',
    ),
});

export type TapWithShortMemoryParam = z.infer<
  typeof tapWithShortMemoryParamSchema
>;

export const clearShortMemoryParamSchema = z.object({
  reason: z
    .string()
    .optional()
    .describe('Why ShortMemory is being cleared (optional).'),
});

export type ClearShortMemoryParam = z.infer<typeof clearShortMemoryParamSchema>;

export const hoverWithShortMemoryParamSchema = z.object({
  token: z
    .string()
    .describe('Token for the target (must exist in ShortMemory).'),
});

export type HoverWithShortMemoryParam = z.infer<
  typeof hoverWithShortMemoryParamSchema
>;

export const rightClickWithShortMemoryParamSchema = z.object({
  token: z
    .string()
    .describe('Token for the target (must exist in ShortMemory).'),
});

export type RightClickWithShortMemoryParam = z.infer<
  typeof rightClickWithShortMemoryParamSchema
>;

export const doubleClickWithShortMemoryParamSchema = z.object({
  token: z
    .string()
    .describe('Token for the target (must exist in ShortMemory).'),
});

export type DoubleClickWithShortMemoryParam = z.infer<
  typeof doubleClickWithShortMemoryParamSchema
>;

export const inputWithShortMemoryParamSchema = z.object({
  token: z
    .string()
    .describe('Token for the input field (must exist in ShortMemory).'),
  value: z
    .union([z.string(), z.number()])
    .transform((val) => String(val))
    .describe(
      'The text to input. Provide the final content for replace/append modes, or an empty string when using clear mode to remove existing text.',
    ),
  mode: z
    .enum(['replace', 'clear', 'append'])
    .default('replace')
    .optional()
    .describe(
      'Input mode: "replace" (default) - clear the field and input the value; "append" - append the value to existing content; "clear" - clear the field without inputting new text.',
    ),
});

export type InputWithShortMemoryParam = z.infer<
  typeof inputWithShortMemoryParamSchema
>;

export type WarmupShortMemoryDeps = {
  service: Service;
  modelConfigManager: ModelConfigManager;
  locateAll: (
    prompts: TUserPrompt | TUserPrompt[],
    opt?: LocateOption & { freezeContext?: boolean },
  ) => Promise<Array<{ rect?: Rect; center?: [number, number]; dpr?: number }>>;
  getFrozenUIContext: () => UIContext | undefined;
  freezePageContext: () => Promise<void>;
  unfreezePageContext: () => Promise<void>;
  getPoints: () => Record<string, ShortMemoryTokenPoint>;
  setPoints: (points: Record<string, ShortMemoryTokenPoint>) => void;
};

export function buildShortMemoryAiContext(options: {
  points: Record<string, ShortMemoryTokenPoint>;
}): string | undefined {
  const tokens = Object.keys(options.points);
  if (tokens.length === 0) {
    return undefined;
  }

  const baseTokenGroups = new Map<string, number[]>();
  const plainTokens: string[] = [];
  for (const token of tokens) {
    const match = token.match(/^(.*)#(\d+)$/);
    if (match) {
      const base = match[1];
      const index = Number(match[2]);
      const list = baseTokenGroups.get(base) || [];
      list.push(index);
      baseTokenGroups.set(base, list);
    } else {
      plainTokens.push(token);
    }
  }

  const groupSummaries = Array.from(baseTokenGroups.entries()).map(
    ([base, indices]) => {
      const sorted = indices.sort((a, b) => a - b);
      const first = sorted[0];
      const last = sorted[sorted.length - 1];
      const range = first === last ? `#${first}` : `#${first}..#${last}`;
      return `${base}${range} (count ${sorted.length})`;
    },
  );
  const allTokensLine = tokens.join(', ');

  return [
    '[ShortMemory] I have pre-located and cached a set of targets (valid only for the current screen/context).',
    groupSummaries.length
      ? `Token groups: ${groupSummaries.join('; ')}`
      : undefined,
    plainTokens.length
      ? `Ungrouped tokens: ${plainTokens.join(', ')}`
      : undefined,
    `All tokens (full list): ${allTokensLine}`,
    'Tokens are literal identifiers for elements already located in the current context. Reuse them verbatim and do not invent new ones.',
    'If tokens share a base name (e.g. "Follow#1", "Follow#2"), they are multiple matches of the same target type.',
    'If the instruction requests "all"/"every" of a target type, include ALL matching tokens rather than picking a single one.',
    'For network-bound flows (e.g. each tap triggers a request), set TapWithShortMemory.intervalMs >= 1000ms; otherwise choose a reasonable interval.',
    'When the instruction can be satisfied by these tokens, prefer token-based actions (TapWithShortMemory / InputWithShortMemory) over re-locating.',
  ]
    .filter(Boolean)
    .join('\n');
}

export function defineActionWarmupShortMemory(options: {
  warmupShortMemory: (
    param: WarmupShortMemoryParam,
    context?: { uiContext?: UIContext },
  ) => Promise<void>;
  getPointCount: () => number;
}): DeviceAction<WarmupShortMemoryParam, { count: number }> {
  return defineAction<typeof warmupShortMemoryParamSchema>({
    name: 'WarmupShortMemory',
    description:
      'Proactively locate and cache potential targets into short-term memory for later actions on the current screen.',
    interfaceAlias: 'warmupShortMemory',
    paramSchema: warmupShortMemoryParamSchema,
    call: async (param, context) => {
      await options.warmupShortMemory(param, {
        uiContext: context?.uiContext,
      });
      return {
        count: options.getPointCount(),
      };
    },
    delayAfterRunner: 0,
  });
}

export function defineActionClearShortMemory(options: {
  clearPoints: () => void;
  getPointCount: () => number;
}): DeviceAction<ClearShortMemoryParam, { cleared: number }> {
  return defineAction<typeof clearShortMemoryParamSchema>({
    name: 'ClearShortMemory',
    description:
      'Clear short-term memory tokens when the UI context has changed or tokens are no longer valid.',
    interfaceAlias: 'clearShortMemory',
    paramSchema: clearShortMemoryParamSchema,
    call: async () => {
      const cleared = options.getPointCount();
      options.clearPoints();
      return {
        cleared,
      };
    },
    delayAfterRunner: 0,
  });
}

export function defineActionTapWithShortMemory(options: {
  interfaceInstance: AbstractInterface;
  getPoints: () => Record<string, ShortMemoryTokenPoint>;
}): DeviceAction<TapWithShortMemoryParam, { count: number }> {
  return defineAction<typeof tapWithShortMemoryParamSchema>({
    name: 'TapWithShortMemory',
    description:
      'Tap a sequence of pre-located tokens (no locate step). Use this for fast continuous taps like dialer keypad. Tokens must be preloaded by the caller.',
    interfaceAlias: 'aiTapWithShortMemory',
    paramSchema: tapWithShortMemoryParamSchema,
    call: async (param, context) => {
      const defaultIntervalMs =
        param.tokens.length >= 12 ? 200 : param.tokens.length >= 6 ? 150 : 80;
      const intervalMs =
        typeof param.intervalMs === 'number'
          ? param.intervalMs
          : defaultIntervalMs;
      const strict = param.strict !== undefined ? param.strict : true;

      const tapAction = options.interfaceInstance
        .actionSpace()
        .find((action) => action.name === 'Tap');
      assert(tapAction, 'Tap action not found in interface action space');

      const points = options.getPoints();
      for (const token of param.tokens) {
        const point = points[token];
        if (!point) {
          if (strict) {
            throw new Error(
              `TapWithShortMemory: token not found: ${token}. Did you preload token->point mapping?`,
            );
          }
          continue;
        }

        const locate = {
          center: [point[0], point[1]] as [number, number],
          rect: {
            left: point[0],
            top: point[1],
            width: 1,
            height: 1,
          },
        } as LocateResultElement;

        await tapAction.call({ locate }, context);

        if (intervalMs > 0) {
          await new Promise((r) => setTimeout(r, intervalMs));
        }
      }

      return {
        count: param.tokens.length,
      };
    },
    delayAfterRunner: 0,
  });
}

export function defineActionInputWithShortMemory(options: {
  interfaceInstance: AbstractInterface;
  getPoints: () => Record<string, ShortMemoryTokenPoint>;
}): DeviceAction<InputWithShortMemoryParam, { token: string }> {
  return defineAction<typeof inputWithShortMemoryParamSchema>({
    name: 'InputWithShortMemory',
    description:
      'Input text into a pre-located field token (no locate step). Tokens must be preloaded by the caller.',
    interfaceAlias: 'aiInputWithShortMemory',
    paramSchema: inputWithShortMemoryParamSchema,
    call: async (param, context) => {
      const inputAction = options.interfaceInstance
        .actionSpace()
        .find((action) => action.name === 'Input');
      assert(inputAction, 'Input action not found in interface action space');

      const points = options.getPoints();
      const point = points[param.token];
      if (!point) {
        throw new Error(
          `InputWithShortMemory: token not found: ${param.token}. Did you preload token->point mapping?`,
        );
      }

      const locate = {
        center: [point[0], point[1]] as [number, number],
        rect: {
          left: point[0],
          top: point[1],
          width: 1,
          height: 1,
        },
      } as LocateResultElement;

      await inputAction.call(
        {
          locate,
          value: param.value,
          mode: param.mode,
        },
        context,
      );

      return {
        token: param.token,
      };
    },
    delayAfterRunner: 0,
  });
}

export function defineActionHoverWithShortMemory(options: {
  interfaceInstance: AbstractInterface;
  getPoints: () => Record<string, ShortMemoryTokenPoint>;
}): DeviceAction<HoverWithShortMemoryParam, { token: string }> {
  return defineAction<typeof hoverWithShortMemoryParamSchema>({
    name: 'HoverWithShortMemory',
    description:
      'Hover on a pre-located token (no locate step). Tokens must be preloaded by the caller.',
    interfaceAlias: 'aiHoverWithShortMemory',
    paramSchema: hoverWithShortMemoryParamSchema,
    call: async (param, context) => {
      const hoverAction = options.interfaceInstance
        .actionSpace()
        .find((action) => action.name === 'Hover');
      assert(hoverAction, 'Hover action not found in interface action space');

      const points = options.getPoints();
      const point = points[param.token];
      if (!point) {
        throw new Error(
          `HoverWithShortMemory: token not found: ${param.token}. Did you preload token->point mapping?`,
        );
      }

      const locate = {
        center: [point[0], point[1]] as [number, number],
        rect: {
          left: point[0],
          top: point[1],
          width: 1,
          height: 1,
        },
      } as LocateResultElement;

      await hoverAction.call({ locate }, context);

      return {
        token: param.token,
      };
    },
    delayAfterRunner: 0,
  });
}

export function defineActionRightClickWithShortMemory(options: {
  interfaceInstance: AbstractInterface;
  getPoints: () => Record<string, ShortMemoryTokenPoint>;
}): DeviceAction<RightClickWithShortMemoryParam, { token: string }> {
  return defineAction<typeof rightClickWithShortMemoryParamSchema>({
    name: 'RightClickWithShortMemory',
    description:
      'Right click a pre-located token (no locate step). Tokens must be preloaded by the caller.',
    interfaceAlias: 'aiRightClickWithShortMemory',
    paramSchema: rightClickWithShortMemoryParamSchema,
    call: async (param, context) => {
      const rightClickAction = options.interfaceInstance
        .actionSpace()
        .find((action) => action.name === 'RightClick');
      assert(
        rightClickAction,
        'RightClick action not found in interface action space',
      );

      const points = options.getPoints();
      const point = points[param.token];
      if (!point) {
        throw new Error(
          `RightClickWithShortMemory: token not found: ${param.token}. Did you preload token->point mapping?`,
        );
      }

      const locate = {
        center: [point[0], point[1]] as [number, number],
        rect: {
          left: point[0],
          top: point[1],
          width: 1,
          height: 1,
        },
      } as LocateResultElement;

      await rightClickAction.call({ locate }, context);

      return {
        token: param.token,
      };
    },
    delayAfterRunner: 0,
  });
}

export function defineActionDoubleClickWithShortMemory(options: {
  interfaceInstance: AbstractInterface;
  getPoints: () => Record<string, ShortMemoryTokenPoint>;
}): DeviceAction<DoubleClickWithShortMemoryParam, { token: string }> {
  return defineAction<typeof doubleClickWithShortMemoryParamSchema>({
    name: 'DoubleClickWithShortMemory',
    description:
      'Double click a pre-located token (no locate step). Tokens must be preloaded by the caller.',
    interfaceAlias: 'aiDoubleClickWithShortMemory',
    paramSchema: doubleClickWithShortMemoryParamSchema,
    call: async (param, context) => {
      const doubleClickAction = options.interfaceInstance
        .actionSpace()
        .find((action) => action.name === 'DoubleClick');
      assert(
        doubleClickAction,
        'DoubleClick action not found in interface action space',
      );

      const points = options.getPoints();
      const point = points[param.token];
      if (!point) {
        throw new Error(
          `DoubleClickWithShortMemory: token not found: ${param.token}. Did you preload token->point mapping?`,
        );
      }

      const locate = {
        center: [point[0], point[1]] as [number, number],
        rect: {
          left: point[0],
          top: point[1],
          width: 1,
          height: 1,
        },
      } as LocateResultElement;

      await doubleClickAction.call({ locate }, context);

      return {
        token: param.token,
      };
    },
    delayAfterRunner: 0,
  });
}

export async function warmupShortMemory(
  param: WarmupShortMemoryParam,
  options: { uiContext?: UIContext } | undefined,
  deps: WarmupShortMemoryDeps,
): Promise<void> {
  const targets = param.targets || [];
  const freezeContext = param.freezeContext ?? true;
  const clearShortMemory = param.clearShortMemory ?? true;
  const uiContext = options?.uiContext;
  const shouldFreezeContext = freezeContext && !uiContext;
  const modelConfigForDefaultIntent =
    deps.modelConfigManager.getModelConfig('default');

  if (targets.length === 0) {
    return;
  }

  const existingPoints = clearShortMemory ? {} : { ...deps.getPoints() };

  const normalizedTargets = targets.map((target) =>
    typeof target === 'string'
      ? { prompt: target, mode: 'single' as const }
      : {
          prompt: target.prompt,
          mode: target.mode ?? 'single',
        },
  );

  const alreadyFrozen = Boolean(deps.getFrozenUIContext());
  if (shouldFreezeContext && !alreadyFrozen) {
    await deps.freezePageContext();
  }

  try {
    const singleTargets = normalizedTargets.filter(
      (target) => target.mode !== 'all',
    );
    if (singleTargets.length) {
      const prompts = singleTargets.map((target) => target.prompt);
      const results = uiContext
        ? (
            await deps.service.locateMulti(
              prompts.map(
                (prompt) => buildDetailedLocateParam(prompt) || { prompt },
              ),
              { context: uiContext },
              modelConfigForDefaultIntent,
            )
          ).results
        : await deps.locateAll(prompts, {
            freezeContext: false,
          });
      for (let i = 0; i < prompts.length; i += 1) {
        const token = prompts[i];
        const center = results[i]?.center;
        if (Array.isArray(center) && center.length === 2) {
          existingPoints[token] = [Number(center[0]), Number(center[1])];
        } else {
          console.warn(
            `WarmupShortMemory failed to locate center for token: ${token}`,
          );
        }
      }
    }

    const allTargets = normalizedTargets.filter(
      (target) => target.mode === 'all',
    );
    for (const target of allTargets) {
      const results = uiContext
        ? (
            await deps.service.locateAll(
              buildDetailedLocateParam(target.prompt) || {
                prompt: target.prompt,
              },
              { context: uiContext },
              modelConfigForDefaultIntent,
            )
          ).results
        : await deps.locateAll(target.prompt, {
            freezeContext: false,
          });
      for (let i = 0; i < results.length; i += 1) {
        const center = results[i]?.center;
        const token = `${target.prompt}#${i + 1}`;
        if (Array.isArray(center) && center.length === 2) {
          existingPoints[token] = [Number(center[0]), Number(center[1])];
        } else {
          console.warn(
            `WarmupShortMemory failed to locate center for token: ${token}`,
          );
        }
      }
    }
  } finally {
    if (shouldFreezeContext && !alreadyFrozen) {
      await deps.unfreezePageContext();
    }
  }

  deps.setPoints(existingPoints);
}
