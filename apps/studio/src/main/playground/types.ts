import type { PlaygroundBootstrap } from '@shared/electron-contract';

// Keep the old alias — android-runtime.ts still uses it internally.
export type { PlaygroundBootstrap as AndroidPlaygroundBootstrap } from '@shared/electron-contract';

export interface AndroidPlaygroundPackagePaths {
  packageRoot: string;
  staticDir: string;
}

/** Lifecycle contract for a playground runtime (single- or multi-platform). */
export interface PlaygroundRuntimeService {
  close: () => Promise<void>;
  getBootstrap: () => PlaygroundBootstrap;
  restart: () => Promise<PlaygroundBootstrap>;
  start: () => Promise<PlaygroundBootstrap>;
}

/**
 * @deprecated Use {@link PlaygroundRuntimeService} — this alias exists so
 * `android-runtime.ts` compiles without changes during the migration.
 */
export type AndroidPlaygroundRuntimeService = PlaygroundRuntimeService;
