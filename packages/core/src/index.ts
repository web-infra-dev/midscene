import { z } from 'zod';
import Service from './service/index';
import { TaskRunner } from './task-runner';
import { getVersion } from './utils';

export {
  standardPlan,
  AiLocateElement,
  runConnectivityTest,
  getMidsceneLocationSchema,
  PointSchema,
  SizeSchema,
  RectSchema,
  TMultimodalPromptSchema,
  TUserPromptSchema,
  type TMultimodalPrompt,
  type TUserPrompt,
  type ConnectivityTestConfig,
  type ConnectivityTestResult,
} from './ai-model/index';

export {
  MIDSCENE_MODEL_NAME,
  type CreateOpenAIClientFn,
} from '@midscene/shared/env';

export type * from './types';
export {
  ServiceError,
  ExecutionDump,
  ReportActionDump,
  GroupedActionDump,
  type IExecutionDump,
  type IReportActionDump,
  type IGroupedActionDump,
  type ReportMeta,
  type GroupMeta,
} from './types';

export { z };

export default Service;
export { TaskRunner, Service, getVersion };

export type {
  MidsceneYamlScript,
  MidsceneYamlTask,
  MidsceneYamlFlowItem,
  MidsceneYamlConfigResult,
  MidsceneYamlConfig,
  MidsceneYamlScriptWebEnv,
  MidsceneYamlScriptAndroidEnv,
  MidsceneYamlScriptIOSEnv,
  MidsceneYamlScriptHarmonyEnv,
  MidsceneYamlTargetConfig,
  MidsceneYamlTargetKey,
  MidsceneYamlScriptEnv,
  LocateOption,
  DetailedLocateParam,
} from './yaml';

export {
  Agent,
  type AgentOpt,
  type AiActOptions,
  type GherkinStepKeyword,
  type MidsceneUsageMetrics,
  type RunGherkinScenarioOptions,
  type UsageBucket,
  createAgent,
  type UIObservation,
  type UIObserver,
  type UIObserverOption,
} from './agent';
export {
  describeElementAtPoint,
  verifyElementDescriptionAtPoint,
  verifyLocator,
  type DescribeElementAtPointOptions,
  type DescribeElementCoordinateSpace,
  type ElementDescriberRuntime,
  type VerifyElementDescriptionAtPointOptions,
} from './element-describer';

// Dump utilities
export {
  createInlineImageResolver,
  restoreImageReferences,
  restoreReportImageReferences,
  escapeContent,
  unescapeContent,
  parseImageScripts,
  parseDumpScript,
  parseDumpScriptAttributes,
  generateImageScriptTag,
  generateDumpScriptTag,
  deriveTaskStatus,
  deriveCaseStatus,
} from './dump';
export type {
  TaskStatusFields,
  DerivedTaskStatus,
  RestoredScreenshotReference,
  StoredImageReferenceResolver,
} from './dump';
export {
  getTaskSearchArea,
  getTaskServiceDump,
} from './dump/task-service-dump';

// Report generator
export type { IReportGenerator } from './report-generator';
export { ReportGenerator, nullReportGenerator } from './report-generator';
export {
  collectDedupedExecutions,
  ReportMergingTool,
  dedupeExecutionsKeepLatest,
  splitReportHtmlByExecution,
} from './report';
export {
  createReportCliCommands,
  reportFileToMarkdown,
  splitReportFile,
  mergeReportFiles,
  type ConsumeReportFileAction,
  type ReportFileToMarkdownOptions,
  type ReportCliCommandDefinition,
  type ReportCliCommandEntry,
  type SplitReportFileOptions,
  type MergeReportFilesOptions,
  type MergeReportFilesResult,
} from './report-cli';
export {
  REPORT_ANALYSIS_CATEGORY_LABELS,
  REPORT_ANALYSIS_CONFIDENCE_LEVELS,
  REPORT_EVIDENCE_SOURCES,
  REPORT_FAILED_RESULT_ASSESSMENTS,
  REPORT_PASSED_RESULT_ASSESSMENTS,
  REPORT_RESULT_ASSESSMENTS,
  getReportAnalysisJsonSchema,
  parseReportAnalysisResultJson,
  renderReportAnalysisResult,
  renderReportAnalysisResultFile,
  renderReportAnalysisResultMarkdownFile,
  validateReportAnalysisResult,
  type MidsceneReportAnalysisResult,
  type ReportAnalysisCategory,
  type ReportAnalysisCauseCategory,
  type ReportAnalysisConfidence,
  type ReportAnalysisEvidence,
  type ReportAnalysisJsonSchema,
  type ReportIncompleteExecutionAnalysisResult,
  type ReportEvidenceSource,
  type ReportFailedResultAnalysisResult,
  type ReportFailedResultAssessment,
  type ReportPassedResultAnalysisResult,
  type ReportPassedResultAssessment,
  type ReportResultAssessment,
} from './report-analysis-result';
export {
  REPORT_STATUSES,
  inspectReport,
  inspectReportFile,
  type InspectReportOptions,
  type InspectReportFileOptions,
  type PublicReportInspectionResult,
  type ReportInspectionResult,
  type ReportStatus,
} from './report-inspection';

// ScreenshotItem
export { ScreenshotItem } from './screenshot-item';
export type {
  ImageUrlRef,
  ScreenshotRef,
  StoredImageRef,
} from './dump/image-reference';
export {
  ReportImageStore,
  ScreenshotStore,
} from './dump/screenshot-store';

export {
  executionToMarkdown,
  reportToMarkdown,
  type ExecutionMarkdownOptions,
  type ExecutionMarkdownResult,
  type ReportMarkdownOptions,
  type ReportMarkdownResult,
  type MarkdownAttachment,
} from './report-markdown';
