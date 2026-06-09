/** POC: shared flow-IR — see `types.ts` for the design notes. */
export {
  MAX_FLOW_CALL_DEPTH,
  assertIdentifier,
} from './types';
export type {
  PromptRole,
  PromptStepIR,
  CaptureStepIR,
  CallFlowStepIR,
  FlowIRStep,
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
