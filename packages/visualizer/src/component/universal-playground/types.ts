import type { DeviceAction, UIContext } from '@midscene/core';
import type { ComponentType, ReactNode } from 'react';
import type { PlaygroundResult } from '../playground/playground-types';

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
