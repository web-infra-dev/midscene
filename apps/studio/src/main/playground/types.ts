import type { StudioAgentOptions } from '@shared/agent-options';
import type { PlaygroundBootstrap } from '@shared/electron-contract';

/** Lifecycle contract for a playground runtime (single- or multi-platform). */
export interface PlaygroundRuntimeService {
  close: () => Promise<void>;
  getBootstrap: () => PlaygroundBootstrap;
  restart: () => Promise<PlaygroundBootstrap>;
  start: () => Promise<PlaygroundBootstrap>;
  updateAgentOptions: (options: StudioAgentOptions) => Promise<void>;
}
