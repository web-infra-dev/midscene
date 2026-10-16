import type { ChromeRecordedEvent } from '@midscene/recorder-ui';
import { expect, it, rs } from '@rstest/core';
import { RecorderEventSender } from '../src/scripts/recorder-event-sender';

it('serializes overlapping batches and retries only unacknowledged versions', async () => {
  let release!: () => void;
  let started!: () => void;
  const sending = new Promise<void>((resolve) => {
    started = resolve;
  });
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  const first = { hashId: 'first' } as ChromeRecordedEvent;
  const updated = { hashId: 'updated' } as ChromeRecordedEvent;
  const click = { hashId: 'click' } as ChromeRecordedEvent;
  const send = rs.fn(async (event: ChromeRecordedEvent) => {
    if (event === first) {
      started();
      await pending;
    }
    if (
      event === click &&
      send.mock.calls.filter(([item]) => item === click).length === 1
    )
      throw new Error('Disconnected');
  });
  const sender = new RecorderEventSender(async () => {}, send);
  const initial = sender.send([first], false);
  const next = sender.send([updated, click], false);
  const rejected = expect(next).rejects.toThrow('Disconnected');
  await sending;
  expect(send).toHaveBeenCalledTimes(1);
  release();
  await initial;
  await rejected;
  await sender.send([updated, click], true);
  expect(send.mock.calls.map(([event]) => event.hashId)).toEqual([
    'first',
    'updated',
    'click',
    'click',
  ]);
  expect(send).toHaveBeenNthCalledWith(2, updated, 0, 2, 'first');
});
