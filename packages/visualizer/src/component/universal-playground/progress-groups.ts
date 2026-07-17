import type { InfoListItem } from '../../types';

/**
 * Returns the final progress item from each contiguous execution group.
 * Non-progress conversation items (such as a result or the next prompt)
 * terminate the current group.
 */
export function getLastProgressItemIdsByGroup(
  items: InfoListItem[],
): Set<string> {
  const lastIds = new Set<string>();

  for (let index = 0; index < items.length; index++) {
    const item = items[index];
    if (item?.type === 'progress' && items[index + 1]?.type !== 'progress') {
      lastIds.add(item.id);
    }
  }

  return lastIds;
}
