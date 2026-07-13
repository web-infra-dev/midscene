import { describe, expect, it } from 'vitest';
import { getLastProgressItemIdsByGroup } from '../src/component/universal-playground/progress-groups';
import type { InfoListItem } from '../src/types';

function item(id: string, type: InfoListItem['type']): InfoListItem {
  return { content: '', id, timestamp: new Date(), type };
}

describe('getLastProgressItemIdsByGroup', () => {
  it('ends each task timeline before its result and the next task prompt', () => {
    const items = [
      item('user-1', 'user'),
      item('system-1', 'system'),
      item('progress-1a', 'progress'),
      item('progress-1b', 'progress'),
      item('result-1', 'result'),
      item('user-2', 'user'),
      item('system-2', 'system'),
      item('progress-2a', 'progress'),
    ];

    expect([...getLastProgressItemIdsByGroup(items)]).toEqual([
      'progress-1b',
      'progress-2a',
    ]);
  });
});
