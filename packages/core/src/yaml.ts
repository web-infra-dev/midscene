import type { TUserPrompt } from './common';
import type { AndroidDeviceOpt, IOSDeviceOpt } from './device';
import type { AgentOpt, LocateResultElement, Rect } from './types';
import type { UIContext } from './types';

export interface LocateOption {
  prompt?: TUserPrompt;
  deepThink?: boolean; // only available in vl model
  cacheable?: boolean; // user can set this param to false to disable the cache for a single agent api
  xpath?: string; // only available in web
  uiContext?: UIContext;
}

export interface ServiceExtractOption {
  domIncluded?: boolean | 'visible-only';
  screenshotIncluded?: boolean;
  [key: string]: unknown;
}

export interface ReferenceImage {
  base64: string;
  rect?: Rect;
}

export interface DetailedLocateParam extends LocateOption {
  prompt: TUserPrompt;
  referenceImage?: ReferenceImage;
}

export type ScrollType =
  | 'singleAction'
  | 'scrollToBottom'
  | 'scrollToTop'
  | 'scrollToRight'
  | 'scrollToLeft'
  // Legacy aliases kept for backward compatibility
  | 'once'
  | 'untilBottom'
  | 'untilTop'
  | 'untilRight'
  | 'untilLeft';

export type ActionScrollParam = {
  direction?: 'down' | 'up' | 'right' | 'left';
  scrollType?: ScrollType;
  distance?: number | null;
  locate?: LocateResultElement;
};

export type ScrollParam = Omit<ActionScrollParam, 'locate'>;

export interface MidsceneYamlScript {
  // @deprecated
  target?: MidsceneYamlScriptWebEnv;

  web?: MidsceneYamlScriptWebEnv;
  android?: MidsceneYamlScriptAndroidEnv;
  ios?: MidsceneYamlScriptIOSEnv;

  interface?: MidsceneYamlScriptEnvGeneralInterface;
  config?: MidsceneYamlScriptConfig;
  agent?: MidsceneYamlScriptAgentOpt;

  tasks: MidsceneYamlTask[];
}

export interface MidsceneYamlTask {
  name: string;
  flow: MidsceneYamlFlowItem[];
  continueOnError?: boolean;
}

/**
 * Agent configuration options that can be specified in YAML scripts.
 *
 * This type includes serializable fields from AgentOpt, excluding non-serializable
 * fields like functions and complex objects. All fields are optional.
 *
 * @remarks
 * - testId priority: CLI parameter > YAML agent.testId > filename
 * - These settings apply to all platforms (Web, Android, iOS, Generic Interface)
 * - modelConfig is configured through environment variables, not in YAML
 *
 * @example
 * ```yaml
 * agent:
 *   testId: "checkout-test"
 *   groupName: "E2E Test Suite"
 *   generateReport: true
 *   replanningCycleLimit: 30
 *   cache:
 *     id: "checkout-cache"
 *     strategy: "read-write"
 * ```
 */
export type MidsceneYamlScriptAgentOpt = Pick<
  AgentOpt,
  | 'testId'
  | 'groupName'
  | 'groupDescription'
  | 'generateReport'
  | 'autoPrintReportMsg'
  | 'reportFileName'
  | 'replanningCycleLimit'
  | 'aiActContext'
  | 'aiActionContext'
  | 'cache'
>;

export interface MidsceneYamlScriptConfig {
  output?: string;
  unstableLogContent?: boolean | string;
}

export interface MidsceneYamlScriptEnvGeneralInterface {
  // this will work as `const {...} = import('...'); const interface = new ...(param)`
  module: string;
  export?: string;
  param?: Record<string, any>;
}

export interface MidsceneYamlScriptWebEnv
  extends MidsceneYamlScriptConfig,
    MidsceneYamlScriptAgentOpt {
  // for web only
  serve?: string;
  url: string;

  // puppeteer only
  userAgent?: string;
  acceptInsecureCerts?: boolean;
  viewportWidth?: number;
  viewportHeight?: number;
  viewportScale?: number;
  waitForNetworkIdle?: {
    timeout?: number;
    continueOnNetworkIdleError?: boolean; // should continue if failed to wait for network idle, true for default
  };
  cookie?: string;
  forceSameTabNavigation?: boolean; // if track the newly opened tab, true for default in yaml script

  /**
   * Custom Chrome launch arguments (Puppeteer only, not supported in bridge mode).
   *
   * Allows passing custom command-line arguments to Chrome/Chromium when launching the browser.
   * This is useful for testing scenarios that require specific browser configurations.
   *
   * ⚠️ Security Warning: Some arguments (e.g., --no-sandbox, --disable-web-security) may
   * reduce browser security. Use only in controlled testing environments.
   *
   * @example
   * ```yaml
   * web:
   *   url: https://example.com
   *   chromeArgs:
   *     - '--disable-features=ThirdPartyCookiePhaseout'
   *     - '--disable-features=SameSiteByDefaultCookies'
   *     - '--window-size=1920,1080'
   * ```
   */
  chromeArgs?: string[];

  // bridge mode config
  bridgeMode?: false | 'newTabWithUrl' | 'currentTab';
  closeNewTabsAfterDisconnect?: boolean;
}

export interface MidsceneYamlScriptAndroidEnv
  extends MidsceneYamlScriptConfig,
    Omit<AndroidDeviceOpt, 'customActions'> {
  // The Android device ID to connect to, optional, will use the first device if not specified
  deviceId?: string;

  // The URL or app package to launch, optional, will use the current screen if not specified
  launch?: string;
}

export interface MidsceneYamlScriptIOSEnv
  extends MidsceneYamlScriptConfig,
    Omit<IOSDeviceOpt, 'customActions'> {
  // The URL or app bundle ID to launch, optional, will use the current screen if not specified
  launch?: string;
}

export type MidsceneYamlScriptEnv =
  | MidsceneYamlScriptWebEnv
  | MidsceneYamlScriptAndroidEnv
  | MidsceneYamlScriptIOSEnv;

export interface MidsceneYamlFlowItemAIAction {
  // defined as aiAction for backward compatibility
  aiAction?: string;
  ai?: string; // this is the shortcut for aiAct
  aiAct?: string;
  aiActionProgressTips?: string[];
  cacheable?: boolean;
  [key: string]: unknown;
}

export interface MidsceneYamlFlowItemAIAssert {
  aiAssert: string;
  errorMessage?: string;
  name?: string;
  [key: string]: unknown;
}

export interface MidsceneYamlFlowItemAIWaitFor {
  aiWaitFor: string;
  timeout?: number;
  [key: string]: unknown;
}

export interface MidsceneYamlFlowItemEvaluateJavaScript {
  javascript: string;
  name?: string;
}

export interface MidsceneYamlFlowItemSleep {
  sleep: number;
}

export interface MidsceneYamlFlowItemLogScreenshot {
  logScreenshot?: string; // optional, the title of the screenshot
  recordToReport?: string; // preferred key for record title
  content?: string;
}

export type MidsceneYamlFlowItem =
  | MidsceneYamlFlowItemAIAction
  | MidsceneYamlFlowItemAIAssert
  | MidsceneYamlFlowItemAIWaitFor
  | MidsceneYamlFlowItemEvaluateJavaScript
  | MidsceneYamlFlowItemSleep
  | MidsceneYamlFlowItemLogScreenshot;

export interface FreeFn {
  name: string;
  fn: () => void;
}

export interface ScriptPlayerTaskStatus extends MidsceneYamlTask {
  status: ScriptPlayerStatusValue;
  currentStep?: number;
  totalSteps: number;
  error?: Error;
}

export type ScriptPlayerStatusValue = 'init' | 'running' | 'done' | 'error';

// Index YAML file types for batch execution
export interface MidsceneYamlConfig {
  concurrent?: number;
  continueOnError?: boolean;
  summary?: string;
  shareBrowserContext?: boolean;
  web?: MidsceneYamlScriptWebEnv;
  android?: MidsceneYamlScriptAndroidEnv;
  ios?: MidsceneYamlScriptIOSEnv;
  files: string[];
  headed?: boolean;
  keepWindow?: boolean;
  dotenvOverride?: boolean;
  dotenvDebug?: boolean;
}

export interface MidsceneYamlConfigOutput {
  format?: 'json';
  path?: string;
}

export interface MidsceneYamlConfigResult {
  file: string;
  success: boolean;
  executed: boolean;
  output?: string | null;
  report?: string | null;
  error?: string;
  duration?: number;
  /**
   * Type of result:
   * - 'success': All tasks completed successfully
   * - 'failed': Execution failed (player error)
   * - 'partialFailed': Some tasks failed but execution continued (continueOnError)
   * - 'notExecuted': Not executed due to previous failures
   */
  resultType?: 'success' | 'failed' | 'partialFailed' | 'notExecuted';
}
