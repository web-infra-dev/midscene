import type { GroupedActionDump, UIContext } from '@midscene/core';
import type { ChromeExtensionProxyPageAgent } from '@midscene/web/chrome-extension';
import type { StaticPageAgent } from '@midscene/web/playground';
import type { WebUIContext } from '@midscene/web/utils';
import type { ReplayScriptsInfo } from '../replay-scripts';

// 运行结果类型
export interface PlaygroundResult {
  result: any;
  dump: GroupedActionDump | null;
  reportHTML: string | null;
  error: string | null;
}

// Playground组件的props类型
export interface PlaygroundProps {
  getAgent: (
    forceSameTabNavigation?: boolean,
  ) => StaticPageAgent | ChromeExtensionProxyPageAgent | null;
  hideLogo?: boolean;
  showContextPreview?: boolean;
  dryMode?: boolean;
}

// 静态Playground组件的props类型
export interface StaticPlaygroundProps {
  context: WebUIContext | null;
}

// 服务模式类型
export type ServiceModeType = 'Server' | 'In-Browser';

// 运行类型
export type RunType = 'aiAction' | 'aiQuery' | 'aiAssert';
