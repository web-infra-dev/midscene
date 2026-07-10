import type { AgentProgressEvent, AgentProgressListener } from '@/types';
import { getDebug } from '@midscene/shared/logger';

const debugError = getDebug('agent-progress-bus', { console: true });

/**
 * A function that publishes one progress notification: it names the producer
 * (`scope`) and the lifecycle `phase`, and hands over the structured `data`.
 * The bus owns the sequence number, so producers never stamp it themselves.
 */
export type AgentProgressPublisher = (
  scope: string,
  phase: string,
  data: unknown,
) => Promise<void>;

/**
 * The generic agent progress bus.
 *
 * A single broadcast channel every producer publishes onto and every consumer
 * subscribes to. The bus is intentionally tiny and producer-agnostic: it stamps
 * a monotonic sequence, wraps the payload in an {@link AgentProgressEvent}
 * envelope, and fans it out to listeners with per-listener error isolation.
 * `aiAct` is the first producer; adding more requires nothing here.
 */
export class AgentProgressBus {
  private listeners: AgentProgressListener[] = [];

  private sequence = 0;

  /**
   * Register a listener. Returns a disposer that removes it.
   */
  subscribe(listener: AgentProgressListener): () => void {
    this.listeners.push(listener);
    return () => {
      this.unsubscribe(listener);
    };
  }

  unsubscribe(listener: AgentProgressListener): void {
    const index = this.listeners.indexOf(listener);
    if (index > -1) {
      this.listeners.splice(index, 1);
    }
  }

  clear(): void {
    this.listeners = [];
  }

  get listenerCount(): number {
    return this.listeners.length;
  }

  /**
   * Stamp a monotonic sequence, build the envelope, and broadcast it to every
   * listener in registration order. A listener that throws is logged and
   * skipped so it cannot break the others or the producer.
   */
  publish: AgentProgressPublisher = async (scope, phase, data) => {
    const event: AgentProgressEvent = {
      scope,
      phase,
      sequence: ++this.sequence,
      data,
    };
    for (const listener of this.listeners) {
      try {
        await listener(event);
      } catch (error) {
        debugError('error in progress listener', error);
      }
    }
  };
}
