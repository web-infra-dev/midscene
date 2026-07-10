import type { TIntent } from '@midscene/shared/env';

export function isLocateIntent(intent?: TIntent): boolean {
  return intent === 'default';
}
