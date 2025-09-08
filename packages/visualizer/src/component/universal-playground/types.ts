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

// 表单值类型
export interface FormValue {
  type: string;
  prompt?: string;
  params?: Record<string, unknown>;
}

// 执行选项类型
export interface ExecutionOptions {
  requestId?: string;
  deepThink?: boolean;
  screenshotIncluded?: boolean;
  domIncluded?: boolean;
  context?: string | object;
}

// 进度回调类型
export type ProgressCallback = (
  step: string,
  status?: 'loading' | 'completed' | 'error',
) => void;

// PlaygroundSDK 接口（简化版，用于类型定义）
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

// 存储提供者接口
export interface StorageProvider {
  saveMessages?(messages: InfoListItem[]): Promise<void>;
  loadMessages?(): Promise<InfoListItem[]>;
  clearMessages?(): Promise<void>;
  saveResult?(id: string, result: InfoListItem): Promise<void>;
}

// 上下文提供者接口
export interface ContextProvider {
  getUIContext?(): Promise<UIContext>;
  refreshContext?(): Promise<UIContext>;
}

// 信息列表项类型（基于 Chrome Extension 的设计）
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

// 主组件配置接口
export interface UniversalPlaygroundConfig {
  showContextPreview?: boolean;
  enablePersistence?: boolean;
  layout?: 'vertical' | 'horizontal';
  showVersionInfo?: boolean;
  enableScrollToBottom?: boolean;
}

// 品牌定制接口
export interface PlaygroundBranding {
  title?: string;
  icon?: ComponentType<any>;
  version?: string;
}

// 主组件 Props 接口
export interface UniversalPlaygroundProps {
  // 核心 SDK
  playgroundSDK: PlaygroundSDKLike;

  // 可选功能提供者
  storage?: StorageProvider;
  contextProvider?: ContextProvider;

  // UI 配置
  config?: UniversalPlaygroundConfig;

  // 品牌定制
  branding?: PlaygroundBranding;

  // 其他 props
  className?: string;
  dryMode?: boolean;
  showContextPreview?: boolean;
}

// 欢迎消息模板
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

// 空结果模板
export const BLANK_RESULT: PlaygroundResult = {
  result: undefined,
  dump: null,
  reportHTML: null,
  error: null,
};
