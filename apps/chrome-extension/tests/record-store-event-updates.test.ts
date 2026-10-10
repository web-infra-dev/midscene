import type { ChromeRecordedEvent } from '@midscene/recorder-ui';
import { beforeEach, expect, it, rs } from '@rstest/core';
rs.mock('../src/utils/indexedDB', () => ({
  dbManager: {},
  initializeDB: rs.fn(),
}));
rs.mock('../src/extension/recorder/logger', () => ({
  recordLogger: { info: rs.fn(), error: rs.fn() },
}));
import { useRecordStore } from '../src/store';

const event = (hashId: string, value: string) =>
  ({ hashId, value, timestamp: 1, type: 'input' }) as ChromeRecordedEvent;
beforeEach(() => useRecordStore.setState({ events: [], isRecording: false }));

it('replaces the delivered input and deduplicates delivery retries', async () => {
  const store = useRecordStore.getState();
  await store.addEvent(event('original', 'a'));
  await store.addEvent(event('updated', 'abc'), 'original');
  await store.addEvent(event('updated', 'abc'), 'original');
  expect(useRecordStore.getState().events.map(({ value }) => value)).toEqual([
    'abc',
  ]);
});

it('retains events from earlier pages when a new bridge starts at index zero', async () => {
  const store = useRecordStore.getState();
  await store.addEvent(event('page-one', 'one'));
  await store.addEvent(event('page-two', 'two'));
  await store.addEvent(event('page-two-updated', 'final'), 'page-two');
  expect(useRecordStore.getState().events.map(({ value }) => value)).toEqual([
    'one',
    'final',
  ]);
});

it('ignores late descriptions for an input that has been replaced', async () => {
  const store = useRecordStore.getState();
  await store.addEvent(event('original', 'a'));
  await store.addEvent(event('updated', 'abc'), 'original');
  await store.updateEvent({
    ...event('original', 'a'),
    elementDescription: 'Late description',
  });
  expect(useRecordStore.getState().events.map(({ value }) => value)).toEqual([
    'abc',
  ]);
  await store.updateEvent({
    ...event('updated', 'abc'),
    elementDescription: 'Current description',
  });
  expect(useRecordStore.getState().events[0].elementDescription).toBe(
    'Current description',
  );
});
