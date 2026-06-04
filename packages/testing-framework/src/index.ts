/**
 * @midscene/testing-framework — AI-native v2 UI testing framework (Phase 0).
 *
 * Public surface implementing RFC 0001:
 *  - `defineMidsceneConfig` / `defineRuntime` authoring helpers
 *  - the node model, verdict contract, output contract, context-assembly
 *    contract (as types)
 *  - an Rstest-backed orchestrator (`runWithRstest`) driving the CLI
 *    (`midscene-tf`), plus a lightweight in-process runner (`runAll`)
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
} from './types';

// —— general agent (swappable) ——
export type {
  GeneralAgentAdapter,
  GeneralAgentInput,
  GeneralAgentResult,
} from './general-agent/types';
export { PiGeneralAgent } from './general-agent/pi-general-agent';
export type { PiGeneralAgentOptions } from './general-agent/pi-general-agent';
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
export { runAll, executeCaseFile } from './runner/run';
export type { RunAllOptions, ExecuteCaseFileOptions } from './runner/run';
export { loadConfig, resolveConfigPath } from './runner/load-config';
export { discoverCases } from './runner/glob';
export { createUIAgent } from './ui-agent/factory';
export type { ResolvedUIAgent } from './ui-agent/factory';

// —— Rstest orchestration (default for the CLI) ——
export {
  runWithRstest,
  createRstestProject,
  runRstestProject,
  defineMidsceneCaseTest,
  resolveTestName,
} from './rstest';
export type {
  RunWithRstestOptions,
  RunWithRstestResult,
  CreateRstestProjectOptions,
  GeneratedCase,
  GeneratedRstestProject,
  RunRstestProjectOptions,
  DefineMidsceneCaseTestOptions,
} from './rstest';
