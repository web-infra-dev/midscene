import type { GroupedActionDump, UIContext } from '@midscene/core';
import type { WebUIContext } from '@midscene/web';
import type { ChromeExtensionProxyPageAgent } from '@midscene/web/chrome-extension';
import type { StaticPageAgent } from '@midscene/web/playground';

// result type
export interface PlaygroundResult {
  result: any;
  dump?: GroupedActionDump | null;
  reportHTML?: string | null;
  error: string | null;
}

// Playground component props type
export interface PlaygroundProps {
  getAgent: (
    forceSameTabNavigation?: boolean,
  ) => StaticPageAgent | ChromeExtensionProxyPageAgent | null;
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
