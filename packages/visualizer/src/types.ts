import type { DeviceAction, UIContext } from '@midscene/core';
import type { ComponentType } from 'react';

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
    shape?: () => Record<string, ZodType>;
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
    ACTION_TYPE: 'aiAction',
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
    if (
      currentField._def.typeName === VALIDATION_CONSTANTS.ZOD_TYPES.DEFAULT &&
      currentField._def.defaultValue
    ) {
      return currentField._def.defaultValue();
    }
    currentField = currentField._def.innerType;
  }

  return undefined;
};

import type { GroupedActionDump, WebUIContext } from '@midscene/core';
import type { PlaygroundAgent } from '@midscene/playground';

// result type
export interface PlaygroundResult {
  result: any;
  dump?: GroupedActionDump | null;
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
  context: WebUIContext | null;
}

// service mode type
export type ServiceModeType = 'Server' | 'In-Browser' | 'In-Browser-Extension';

// run type
export type RunType =
  | 'aiAction'
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
  modelBriefs: string[];
}

// form value type
export interface FormValue {
  type: string;
  prompt?: string;
  params?: Record<string, unknown>;
}

// execution options type
export interface ExecutionOptions {
  requestId?: string;
  deepThink?: boolean;
  screenshotIncluded?: boolean;
  domIncluded?: boolean;
  context?: string | object;
}

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
  cancelExecution?(requestId: string): Promise<void>;
  overrideConfig?(config: any): Promise<void>;
  checkStatus?(): Promise<boolean>;
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
}

// main component config interface
export interface UniversalPlaygroundConfig {
  showContextPreview?: boolean;
  enablePersistence?: boolean;
  layout?: 'vertical' | 'horizontal';
  showVersionInfo?: boolean;
  enableScrollToBottom?: boolean;
}

// branding interface
export interface PlaygroundBranding {
  title?: string;
  icon?: ComponentType<any>;
  version?: string;
}

// main component props interface
export interface UniversalPlaygroundProps {
  // core SDK
  playgroundSDK: PlaygroundSDKLike;

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

// welcome message template
export const WELCOME_MESSAGE_TEMPLATE: Omit<InfoListItem, 'id' | 'timestamp'> =
  {
    type: 'system',
    content: `
      Welcome to Midscene.js Playground!
      
      This is a panel for experimenting and testing Midscene.js features. You can use natural language instructions to operate the web page, such as clicking buttons, filling in forms, querying information, etc.
      
      Please enter your instructions in the input box below to start experiencing.
    `,
    loading: false,
    result: undefined,
    replayScriptsInfo: null,
    replayCounter: 0,
    loadingProgressText: '',
    verticalMode: false,
  };

// blank result template
export const BLANK_RESULT: PlaygroundResult = {
  result: undefined,
  dump: null,
  reportHTML: null,
  error: null,
};
