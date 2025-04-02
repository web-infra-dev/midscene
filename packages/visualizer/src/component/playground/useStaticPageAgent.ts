import type { StaticPageAgent } from '@midscene/web/playground';
import type { WebUIContext } from '@midscene/web/utils';
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
