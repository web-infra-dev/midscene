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
