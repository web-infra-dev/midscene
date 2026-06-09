/**
 * @midscene/testing-framework — AI-native v2 UI testing framework (Phase 0).
 *
 * Public surface implementing RFC 0001:
 *  - `defineMidsceneConfig` / `defineRuntime` authoring helpers
 *  - the node model, verdict contract, output contract, context-assembly
 *    contract (as types)
 *  - a lightweight runner (`runAll`) and CLI (`midscene-tf`)
 *  - the default Pi-backed general agent with a custom model base URL
 *    (decision C′, RFC §4.1)
 */

// —— authoring helpers ——
export { defineMidsceneConfig } from './config';
export { defineRuntime } from './runtime';

// —— config types ——
export type {
  MidsceneConfig,
  UIAgent,
  UIAgentConfig,
  UIAgentFactory,
  UIAgentFactoryCtx,
  UIAgentOptions,
  UIAgentType,
  TestRunnerOptions,
  OutputOptions,
} from './config/types';

// —— runtime node contract ——
export type {
  RuntimeNode,
  RuntimeNodeContext,
  RuntimeNodeResult,
} from './runtime';

// —— core contracts ——
export type {
  Verdict,
  StepOutput,
  StepStatus,
  StepResult,
  CaseResult,
  RunSummary,
  OutputStore,
  TestResultSoFar,
  BuiltinNodeType,
  UiAgentLike,
} from './types';

// —— general agent (swappable) ——
export type {
  GeneralAgentAdapter,
  GeneralAgentInput,
  GeneralAgentResult,
} from './general-agent/types';
export { PiGeneralAgent } from './general-agent/pi-general-agent';
export type { PiGeneralAgentOptions } from './general-agent/pi-general-agent';
export { CodexGeneralAgent } from './general-agent/codex-general-agent';
export { extractSkillReferences } from './general-agent/skills';

// —— YAML ——
export { parseCaseYaml } from './yaml/parse';
export type { ParsedCase, FlowStep } from './yaml/types';
export { BUILTIN_NODES, isBuiltinNode } from './yaml/types';

// —— context assembly ——
export { assembleContext } from './context/assembler';
export type { AssembleContextInput } from './context/assembler';

// —— engine / runner ——
export { runCase } from './engine/run-case';
export type { RunCaseOptions } from './engine/run-case';
export { runAll } from './runner/run';
export type { RunAllOptions } from './runner/run';
export { loadConfig, resolveConfigPath } from './runner/load-config';
export { discoverCases } from './runner/glob';
export { createUIAgent } from './ui-agent/factory';
export type { ResolvedUIAgent } from './ui-agent/factory';

// —— POC: shared flow-IR + authoring front-ends ——
// A flow intermediate representation with a scenario-scoped variable table
// and named, parameterized flows. Two authoring surfaces compile to it: a
// fluent JS/TS API and a Gherkin (.feature) compiler. See POC-GHERKIN.md.
export {
  FlowRegistry,
  createFlowRegistry,
  runScenario,
  substitute,
  listPlaceholders,
  MAX_FLOW_CALL_DEPTH,
} from './flow-ir';
export type {
  FlowIRStep,
  PromptStepIR,
  CaptureStepIR,
  CallFlowStepIR,
  ScenarioIR,
  ScenarioConfigIR,
  FlowDefIR,
  FlowMemoStore,
  FeatureIR,
  RunScenarioOptions,
  ScenarioRunResult,
  ScenarioRunEvent,
  VariableScope,
} from './flow-ir';
export {
  defineFlow,
  scenario,
  feature,
  Given,
  When,
  Then,
  Soft,
  Advisory,
  remember,
  callFlow,
  bindFeature,
  anchorText,
} from './frontends/js';
export type {
  DefineFlowInput,
  ScenarioOptions,
  StepInput,
  FeatureOverlay,
  ScenarioOverlay,
  StepOverlay,
  StepAnchor,
} from './frontends/js';
export { compileFeature, compileFeatureFile } from './frontends/gherkin';
export type { CompiledFeature } from './frontends/gherkin';
