import type {
  WorkflowDocumentExecutionResult,
  WorkflowExecutionRecord,
} from '../test-runner';

interface LegacyYamlPlayerState {
  executionResult?: WorkflowDocumentExecutionResult;
  executionRecord?: WorkflowExecutionRecord;
  fallbackReportFileName?: string;
}

// Hosts can load the public player through CJS and internal integration through ESM.
const stateKey = Symbol.for('@midscene/core/yaml-player-state/v1');
const host = globalThis as typeof globalThis & {
  [stateKey]?: WeakMap<object, LegacyYamlPlayerState>;
};
host[stateKey] ??= new WeakMap();
const states = host[stateKey];

export function initializeLegacyYamlPlayerState(player: object): void {
  states.set(player, {});
}

/** Package integration only; do not expose host controls on ScriptPlayer. */
export function getLegacyYamlPlayerState(
  player: object,
): LegacyYamlPlayerState {
  const state = states.get(player);
  if (!state) throw new Error('Expected an initialized YAML ScriptPlayer.');
  return state;
}
