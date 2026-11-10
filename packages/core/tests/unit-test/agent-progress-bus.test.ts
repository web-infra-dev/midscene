import { AgentProgressBus } from '@/agent/progress';
import type { AgentProgressEvent } from '@/types';
import { describe, expect, it, rs } from '@rstest/core';

describe('AgentProgressBus', () => {
  it('wraps payloads in an envelope and stamps a monotonic sequence', async () => {
    const bus = new AgentProgressBus();
    const events: AgentProgressEvent[] = [];
    bus.subscribe((event) => {
      events.push(event);
    });

    await bus.publish('aiAct', 'start', { prompt: 'open settings' });
    await bus.publish('aiAct', 'complete', { output: 'done' });
    await bus.publish('aiQuery', 'start', { query: 'title' });

    expect(events).toEqual([
      {
        scope: 'aiAct',
        phase: 'start',
        sequence: 1,
        data: { prompt: 'open settings' },
      },
      {
        scope: 'aiAct',
        phase: 'complete',
        sequence: 2,
        data: { output: 'done' },
      },
      {
        scope: 'aiQuery',
        phase: 'start',
        sequence: 3,
        data: { query: 'title' },
      },
    ]);
  });

  it('broadcasts to every listener in registration order', async () => {
    const bus = new AgentProgressBus();
    const order: string[] = [];
    bus.subscribe(() => {
      order.push('a');
    });
    bus.subscribe(() => {
      order.push('b');
    });

    await bus.publish('aiAct', 'start', {});

    expect(order).toEqual(['a', 'b']);
    expect(bus.listenerCount).toBe(2);
  });

  it('awaits async listeners before resolving', async () => {
    const bus = new AgentProgressBus();
    let resolved = false;
    bus.subscribe(async () => {
      await Promise.resolve();
      resolved = true;
    });

    await bus.publish('aiAct', 'start', {});

    expect(resolved).toBe(true);
  });

  it('stops delivering after the disposer returned by subscribe is called', async () => {
    const bus = new AgentProgressBus();
    const listener = rs.fn();
    const dispose = bus.subscribe(listener);

    await bus.publish('aiAct', 'start', {});
    dispose();
    await bus.publish('aiAct', 'complete', {});

    expect(listener).toHaveBeenCalledTimes(1);
    expect(bus.listenerCount).toBe(0);
  });

  it('removes a listener by reference via unsubscribe', async () => {
    const bus = new AgentProgressBus();
    const keep = rs.fn();
    const drop = rs.fn();
    bus.subscribe(keep);
    bus.subscribe(drop);

    bus.unsubscribe(drop);
    await bus.publish('aiAct', 'start', {});

    expect(keep).toHaveBeenCalledTimes(1);
    expect(drop).not.toHaveBeenCalled();
  });

  it('clears all listeners', async () => {
    const bus = new AgentProgressBus();
    const listener = rs.fn();
    bus.subscribe(listener);
    bus.subscribe(rs.fn());

    bus.clear();
    await bus.publish('aiAct', 'start', {});

    expect(listener).not.toHaveBeenCalled();
    expect(bus.listenerCount).toBe(0);
  });

  it('isolates a throwing listener so the others still run and publish resolves', async () => {
    const bus = new AgentProgressBus();
    const after = rs.fn();
    bus.subscribe(() => {
      throw new Error('listener boom');
    });
    bus.subscribe(after);

    await expect(bus.publish('aiAct', 'start', {})).resolves.toBeUndefined();
    expect(after).toHaveBeenCalledTimes(1);
  });
});
