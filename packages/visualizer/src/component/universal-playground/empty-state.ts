import type { ReactNode } from 'react';
import type { InfoListItem } from '../../types';

export function shouldRenderCustomEmptyState(
  infoList: InfoListItem[],
  emptyState?: ReactNode,
): boolean {
  return (
    emptyState !== undefined &&
    infoList.length === 1 &&
    infoList[0]?.id === 'welcome'
  );
}
