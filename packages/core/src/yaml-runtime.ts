/**
 * Internal YAML compatibility integration surface.
 *
 * Keep parser- and format-specific APIs out of the shared Test Runner kernel.
 * This entry exists for Midscene package integration and is not user-facing.
 */
export {
  enterYamlAction,
  enterYamlExecution,
  runInYamlExecutionContext,
} from './yaml/execution-session';
export { getLegacyYamlPlayerState } from './yaml/player-state';
export { isYamlReportEnabled } from './yaml/report-policy';
export { collectLegacyYamlDocument } from './yaml/test-runner-compat';
export { parseLegacyYamlScript } from './yaml/utils';
export {
  getLegacyYamlResultData,
  legacyAgentTestRunnerNodeDefinitions,
} from './yaml/test-runner-nodes';
