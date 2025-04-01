import { Playground, StaticPlayground } from './playground/index';
import { useServerValid } from './playground/useServerValid';
import {
  staticAgentFromContext,
  useStaticPageAgent,
} from './playground/useStaticPageAgent';

// 导出主要组件
export { Playground, StaticPlayground };

// 导出静态代理功能
export { useStaticPageAgent, staticAgentFromContext };

// 导出服务状态检查功能
export { useServerValid };

// 导出扩展功能
export function extensionAgentForTab(forceSameTabNavigation = true) {
  // 这个函数只是一个占位符，在实际使用时会被替换成真正的实现
  console.warn(
    'extensionAgentForTab is not implemented here, it will be overridden by the extension',
  );
  return null;
}
