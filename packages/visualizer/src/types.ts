import type {
  ConnectivityTestResult,
  DeviceAction,
  ModelBrief,
  UIContext,
} from '@midscene/core';
import type { ComponentType, ReactNode } from 'react';

// Zod schema related types - compatible with actual zod types
export interface ZodType {
  _def?: {
    typeName:
      | 'ZodOptional'
      | 'ZodDefault'
      | 'ZodNullable'
      | 'ZodObject'
      | 'ZodEnum'
      | 'ZodNumber'
      | 'ZodString'
      | 'ZodBoolean';
    innerType?: ZodType;
    defaultValue?: () => unknown;
    _serializedDefaultValue?: unknown;
    shape?: (() => Record<string, ZodType>) | Record<string, ZodType>;
    values?: string[];
    description?: string;
  };
  description?: string; // For direct access to description
}

export interface ZodObjectSchema extends ZodType {
  shape: Record<string, ZodType>;
  parse: (data: unknown) => unknown;
}

export interface ZodEnumSchema extends ZodType {
  _def: {
    typeName: 'ZodEnum';
    values: string[];
  };
}

export interface ZodNumberSchema extends ZodType {
  _def: {
    typeName: 'ZodNumber';
  };
}

export interface ZodBooleanSchema extends ZodType {
  _def: {
    typeName: 'ZodBoolean';
  };
}

// Interface for accessing Zod objects at runtime
export interface ZodRuntimeAccess extends ZodType {
  shape?: Record<string, ZodType>;
  description?: string;
  typeName?: string;
  type?: string;
}

// ActionSpace related types - compatible with DeviceAction
export interface ActionSpaceItem
  extends Omit<DeviceAction<any>, 'paramSchema'> {
  paramSchema?: ZodObjectSchema;
}

// Form parameter types
export interface FormParams {
  [key: string]: string | number | boolean | null | undefined;
}

// Validation constants
export const VALIDATION_CONSTANTS = {
  ZOD_TYPES: {
    OPTIONAL: 'ZodOptional',
    DEFAULT: 'ZodDefault',
    NULLABLE: 'ZodNullable',
    OBJECT: 'ZodObject',
    ENUM: 'ZodEnum',
    NUMBER: 'ZodNumber',
    STRING: 'ZodString',
    BOOLEAN: 'ZodBoolean',
  },
  FIELD_FLAGS: {
    LOCATION: 'midscene_location_field_flag',
  },
  DEFAULT_VALUES: {
    ACTION_TYPE: 'aiAct',
    TIMEOUT_MS: 15000,
    CHECK_INTERVAL_MS: 3000,
  },
} as const;

// Type guards
export const isZodObjectSchema = (
  schema: unknown,
): schema is ZodObjectSchema => {
  return (
    typeof schema === 'object' &&
    schema !== null &&
    ('shape' in schema || (schema as { type?: string }).type === 'ZodObject')
  );
};

export const isLocateField = (field: ZodType): boolean => {
  // Handle both runtime Zod objects and processed schema objects from server
  const fieldWithRuntime = field as ZodRuntimeAccess;

  // Check if it's a runtime ZodObject
  if (field._def?.typeName === VALIDATION_CONSTANTS.ZOD_TYPES.OBJECT) {
    // Try different ways to access the shape for runtime Zod objects
    let shape;
    if (field._def.shape) {
      if (typeof field._def.shape === 'function') {
        shape = field._def.shape();
      } else {
        shape = field._def.shape;
      }
    }

    // Also try accessing shape directly from the field object
    if (!shape && fieldWithRuntime.shape) {
      shape = fieldWithRuntime.shape;
    }

    // Check for the location flag in shape
    if (shape && VALIDATION_CONSTANTS.FIELD_FLAGS.LOCATION in shape) {
      return true;
    }

    // Check description contains location-related keywords
    const description =
      (field._def as { description?: string })?.description ||
      fieldWithRuntime.description ||
      '';
    if (
      typeof description === 'string' &&
      description.toLowerCase().includes('input field')
    ) {
      return true;
    }
  }

  // Handle processed schema objects from server (these don't have _def)
  // For these, we need to check if the field represents a location input
  // Since the server processing loses the original Zod metadata, we use heuristics

  // If it's an object-like structure, check for location indicators
  if (typeof field === 'object' && field !== null) {
    // Check if it has properties that suggest it's a location field
    // In processed schemas, location fields typically have specific characteristics

    // Check for description patterns
    const description =
      fieldWithRuntime.description ||
      (fieldWithRuntime._def as { description?: string })?.description ||
      '';
    if (typeof description === 'string') {
      const desc = description.toLowerCase();
      if (
        desc.includes('input field') ||
        desc.includes('element') ||
        desc.includes('locate')
      ) {
        return true;
      }
    }

    // Check for type patterns that suggest location fields
    if (
      (fieldWithRuntime as { typeName?: string }).typeName === 'ZodObject' ||
      (fieldWithRuntime as { type?: string }).type === 'ZodObject'
    ) {
      // For processed schemas, location fields are often described as input fields
      return (
        typeof description === 'string' &&
        description.toLowerCase().includes('input field')
      );
    }
  }

  return false;
};

// Helper function to unwrap nested Zod types
export const unwrapZodType = (
  field: ZodType,
): { actualField: ZodType; isOptional: boolean; hasDefault: boolean } => {
  let actualField = field;
  let isOptional = false;
  let hasDefault = false;

  while (
    actualField._def?.typeName === VALIDATION_CONSTANTS.ZOD_TYPES.OPTIONAL ||
    actualField._def?.typeName === VALIDATION_CONSTANTS.ZOD_TYPES.DEFAULT ||
    actualField._def?.typeName === VALIDATION_CONSTANTS.ZOD_TYPES.NULLABLE
  ) {
    if (
      actualField._def?.typeName === VALIDATION_CONSTANTS.ZOD_TYPES.OPTIONAL
    ) {
      isOptional = true;
    }
    if (actualField._def?.typeName === VALIDATION_CONSTANTS.ZOD_TYPES.DEFAULT) {
      hasDefault = true;
    }
    actualField = actualField._def.innerType || actualField;
  }

  return { actualField, isOptional, hasDefault };
};

// Function to extract default value from Zod field
export const extractDefaultValue = (field: ZodType): unknown => {
  let currentField = field;

  while (currentField._def?.innerType) {
    if (currentField._def.typeName === VALIDATION_CONSTANTS.ZOD_TYPES.DEFAULT) {
      // Runtime Zod: defaultValue is a function
      if (typeof currentField._def.defaultValue === 'function') {
        return currentField._def.defaultValue();
      }
      // Serialized from server: defaultValue was dropped, use fallback
      if (currentField._def._serializedDefaultValue !== undefined) {
        return currentField._def._serializedDefaultValue;
      }
    }
    currentField = currentField._def.innerType;
  }

  return undefined;
};

import type { ExecutionDump, IExecutionDump } from '@midscene/core';
import type {
  BeforeActionHook,
  ExecutionOptions,
  PlaygroundAgent,
  PlaygroundRuntimeInfo,
} from '@midscene/playground';

// result type
export interface PlaygroundResult {
  result: any;
  dump?: ExecutionDump | IExecutionDump | null;
  reportHTML?: string | null;
  error: string | null;
}

// Playground component props type
export interface PlaygroundProps {
  getAgent: (forceSameTabNavigation?: boolean) => PlaygroundAgent | null;
  hideLogo?: boolean;
  showContextPreview?: boolean;
  dryMode?: boolean;
}

// static playground component props type
export interface StaticPlaygroundProps {
  context: UIContext | null;
}

// service mode type
export type ServiceModeType = 'Server' | 'In-Browser' | 'In-Browser-Extension';

// device type
export type DeviceType = 'web' | 'android' | 'ios' | 'harmony' | 'computer';

export type ExecutionUxHint = 'countdown-before-run';

// run type
export type RunType =
  | 'aiAct'
  | 'aiQuery'
  | 'aiAssert'
  | 'aiTap'
  | 'aiDoubleClick'
  | 'aiHover'
  | 'aiInput'
  | 'aiRightClick'
  | 'aiKeyboardPress'
  | 'aiScroll'
  | 'aiLocate'
  | 'aiBoolean'
  | 'aiNumber'
  | 'aiString'
  | 'aiAsk'
  | 'aiWaitFor';

// Define ReplayScriptsInfo to match the interface in replay-scripts.tsx
export interface ReplayScriptsInfo {
  scripts: any[]; // AnimationScript[] but avoiding circular dependency
  width?: number;
  height?: number;
  sdkVersion?: string;
  modelBriefs: ModelBrief[];
}

// form value type
export interface FormValue {
  type: string;
  prompt?: string;
  params?: Record<string, unknown>;
}

// ExecutionOptions is imported from playground package to ensure consistency
export type { ExecutionOptions };

// progress callback type
export type ProgressCallback = (
  step: string,
  status?: 'loading' | 'completed' | 'error',
) => void;

// PlaygroundSDK interface (simplified version, for type definition)
export interface PlaygroundSDKLike {
  executeAction(
    actionType: string,
    value: FormValue,
    options: ExecutionOptions,
  ): Promise<unknown>;
  getActionSpace(context?: any): Promise<DeviceAction<unknown>[]>;
  onProgressUpdate?: (callback: ProgressCallback) => void;
  onDumpUpdate?: (
    callback: (dump: string, executionDump?: ExecutionDump) => void,
  ) => void;
  cancelExecution?(requestId: string): Promise<{
    dump: ExecutionDump | null;
    reportHTML: string | null;
  } | null>;
  getCurrentExecutionData?(): Promise<{
    dump: ExecutionDump | null;
    reportHTML: string | null;
  }>;
  overrideConfig?(config: any): Promise<void>;
  runConnectivityTest?(): Promise<ConnectivityTestResult>;
  checkStatus?(): Promise<boolean>;
  getServiceMode?(): 'In-Browser-Extension' | 'Server';
  getRuntimeInfo?(): Promise<PlaygroundRuntimeInfo | null>;
  setBeforeActionHook?(hook?: BeforeActionHook): void;
  id?: string; // unique ID for SDK instances
}

export interface ExecutionUxConfig {
  hints?: ExecutionUxHint[];
  countdownSeconds?: number;
}

// storage provider interface
export interface StorageProvider {
  saveMessages?(messages: InfoListItem[]): Promise<void>;
  loadMessages?(): Promise<InfoListItem[]>;
  clearMessages?(): Promise<void>;
  saveResult?(id: string, result: InfoListItem): Promise<void>;
}

// context provider interface
export interface ContextProvider {
  getUIContext?(): Promise<UIContext>;
  refreshContext?(): Promise<UIContext>;
}

// info list item type (based on Chrome Extension design)
export interface InfoListItem {
  id: string;
  type: 'user' | 'system' | 'result' | 'progress' | 'separator';
  content: string;
  timestamp: Date;
  result?: PlaygroundResult | null;
  loading?: boolean;
  replayScriptsInfo?: ReplayScriptsInfo | null;
  replayCounter?: number;
  loadingProgressText?: string;
  verticalMode?: boolean;
  actionType?: string; // Track which action type was executed
  /**
   * Identifier for the ExecutionTask that produced this progress item —
   * `task.subType || task.type`, e.g. `'Planning'`, `'Locate'`, `'Tap'`,
   * `'Input'`, `'Scroll'`, `'RunAdbShell'`. Hosts can use this with
   * {@link PromptInputChromeConfig.resolveProgressActionIcon} to render
   * a domain-specific icon in the progress pill.
   */
  actionKind?: string;
}

// main component config interface
export interface UniversalPlaygroundConfig {
  showContextPreview?: boolean;
  storageNamespace?: string;
  layout?: 'vertical' | 'horizontal';
  showVersionInfo?: boolean;
  enableScrollToBottom?: boolean;
  serverMode?: boolean;
  showEnvConfigReminder?: boolean;
  deviceType?: DeviceType;
  executionUx?: ExecutionUxConfig;
  promptInputChrome?: PromptInputChromeConfig;
  /**
   * Whether to render the "clear conversation" button that appears above the
   * message list once there is more than one item. Defaults to `true`.
   * Embedding hosts whose own shell exposes a clear affordance can set this
   * to `false`.
   */
  showClearButton?: boolean;
  /**
   * Whether each system message renders its header (branding icon + title).
   * Defaults to `true`. Compact embeddings may set this to `false` to let the
   * host shell own the branding.
   */
  showSystemMessageHeader?: boolean;
  /**
   * Opt-in controls for how consecutive progress items render in the
   * conversation log. Defaults flatten every progress step inline (no
   * grouping, no connector) so existing hosts keep their behaviour.
   */
  executionFlow?: ExecutionFlowConfig;
}

export interface ExecutionFlowConfig {
  /**
   * When `true`, consecutive progress items are wrapped under a single
   * collapsible "Execution Flow" header. A "run" is bounded by the first
   * non-progress item before and after it.
   */
  collapsible?: boolean;
  /**
   * Label shown on the collapsible header. Defaults to `'Execution Flow'`.
   */
  label?: string;
  /**
   * Visual variant for the progress column.
   *
   * - `'flat'` (default): pills and descriptions render inline at the
   *   conversation column's left edge, no connector line.
   * - `'incut'`: pills stair-step 24px right of the description column,
   *   a 1px connector line runs down the reserved gutter between
   *   consecutive runs, and intra-step spacing is tightened to 8px on
   *   both sides. Matches the incut ProcessFlow design.
   *
   * The variant is applied via a single `data-execution-flow-variant`
   * attribute on the root container, so hosts can also target it in
   * their own CSS when needed.
   */
  variant?: 'flat' | 'incut';
  /**
   * Resolve a domain-specific icon for each progress step. Called with
   * `InfoListItem.actionKind` (e.g. `'Planning'`, `'Locate'`, `'Tap'`,
   * `'Input'`, `'RunAdbShell'`). Returning a React node renders it to
   * the left of the status glyph inside the pill; returning `undefined`
   * falls back to the default mapping shipped by the visualiser, and
   * returning `null` hides the icon slot entirely.
   */
  resolveActionIcon?: (kind: string) => ReactNode | null | undefined;
}

/**
 * Optional visual chrome overrides for the embedded prompt input.
 * - `default` renders the full-featured prompt input (type radio row,
 *   history button, full send/stop controls).
 * - `minimal` renders a compact toolbar with only inline params, an action
 *   dropdown, send/stop — intended for embedded hosts (e.g. Studio) whose
 *   outer shell already owns the type selection affordance.
 */
export interface PromptInputChromeConfig {
  variant?: 'default' | 'minimal';
  placeholder?: string;
  /**
   * Label shown on the primary action button. When provided, overrides the
   * auto-derived label (`actionNameForType(type)`). If omitted, the action
   * name derived from the current type is used, falling back to "Action".
   */
  primaryActionLabel?: string;
  icons?: {
    action?: string;
    actionChevron?: string;
    history?: string;
    settings?: string;
  };
}

// branding interface
export interface PlaygroundBranding {
  title?: string;
  icon?: ComponentType<any>;
  version?: string;
  targetName?: string; // e.g., "web page", "computer", "screen"
}

// main component props interface
export interface UniversalPlaygroundProps {
  // core SDK
  playgroundSDK: PlaygroundSDKLike | null;

  // optional features provider
  storage?: StorageProvider;
  contextProvider?: ContextProvider;

  // UI config
  config?: UniversalPlaygroundConfig;

  // branding
  branding?: PlaygroundBranding;

  // other props
  className?: string;
  dryMode?: boolean;
  showContextPreview?: boolean;
}
