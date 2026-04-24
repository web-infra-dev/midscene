import type { PlaygroundBootstrap } from '@shared/electron-contract';
import type { PlaygroundRuntimeService } from './types';

export function requestPlaygroundBootstrap(
  runtime: PlaygroundRuntimeService,
  onStartError: (error: unknown) => void,
): PlaygroundBootstrap {
  void runtime.start().catch(onStartError);
  return runtime.getBootstrap();
}
