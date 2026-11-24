import { YamlExecutionOwnershipError } from '../yaml/execution-session';
import { isActionReadinessError } from './action-readiness';

/** Failures that cannot be recovered by trying another native implementation. */
export function isNativeExecutionTerminalError(error: unknown): boolean {
  return (
    error instanceof YamlExecutionOwnershipError ||
    isActionReadinessError(error)
  );
}
