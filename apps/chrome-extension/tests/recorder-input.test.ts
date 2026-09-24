import { beforeEach, describe, expect, it, rs } from '@rstest/core';
import {
  EventRecorder,
  type RecordedEvent,
} from '../../../packages/recorder/src/recorder';

describe('EventRecorder input batching', () => {
  let listeners: Map<string, (event: Event) => void>;
  let recorded: RecordedEvent[];
  let recorder: EventRecorder;

  const input = (value: string) => ({
    tagName: 'INPUT',
    type: 'text',
    value,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 20 }),
  });

  beforeEach(() => {
    rs.useFakeTimers();
    listeners = new Map();
    recorded = [];
    rs.stubGlobal('window', {
      innerWidth: 800,
      innerHeight: 600,
      location: { href: 'https://example.com/' },
      setTimeout,
    });
    rs.stubGlobal('document', {
      title: 'Example',
      addEventListener: (type: string, callback: (event: Event) => void) =>
        listeners.set(type, callback),
      removeEventListener: rs.fn(),
    });
    recorder = new EventRecorder((event) => recorded.push(event), 'session');
    recorder.start();
    rs.runOnlyPendingTimers();
    recorded = [];
  });

  it('preserves the first field when another field receives input within the batch delay', () => {
    const first = input('first');
    const second = input('second');
    listeners.get('input')!({ target: first } as unknown as Event);
    rs.advanceTimersByTime(100);
    listeners.get('input')!({ target: second } as unknown as Event);
    expect(recorded.map((event) => event.value)).toEqual(['first']);
    rs.advanceTimersByTime(300);
    expect(recorded.map((event) => event.value)).toEqual(['first', 'second']);
  });

  it('flushes the last input before stopping', () => {
    const field = input('last value');
    listeners.get('input')!({ target: field } as unknown as Event);
    recorder.stop();
    expect(recorded.map((event) => event.value)).toEqual(['last value']);
    rs.advanceTimersByTime(300);
    expect(recorded).toHaveLength(1);
  });
});
