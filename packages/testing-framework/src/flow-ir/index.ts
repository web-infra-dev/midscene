/** POC: shared flow-IR — see `types.ts` for the design notes. */
export {
  IDENTIFIER_PATTERN,
  MAX_FLOW_CALL_DEPTH,
  assertIdentifier,
  flowMemoKey,
  stringifyVarRecord,
} from './types';
export type {
  PromptStepIR,
  CaptureStepIR,
  CallFlowStepIR,
  FlowIRStep,
  FlowMemoStore,
  ScenarioIR,
  ScenarioConfigIR,
  FlowDefIR,
  FeatureIR,
} from './types';
export { FlowRegistry, createFlowRegistry } from './registry';
export { substitute, listPlaceholders } from './substitute';
export type { VariableScope } from './substitute';
export { runScenario } from './run-scenario';
export type {
  RunScenarioOptions,
  ScenarioRunResult,
  ScenarioRunEvent,
} from './run-scenario';
