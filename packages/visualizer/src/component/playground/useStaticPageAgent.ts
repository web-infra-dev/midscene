import type { WebUIContext } from '@midscene/web';
import type { StaticPageAgent } from '@midscene/web/playground';
import { useMemo } from 'react';
import { staticAgentFromContext } from './playground-utils';

export { staticAgentFromContext };

export const useStaticPageAgent = (
  context: WebUIContext | undefined | null,
): StaticPageAgent | null => {
  const agent = useMemo(() => {
    if (!context) return null;
    return staticAgentFromContext(context);
  }, [context]);

  return agent;
};
