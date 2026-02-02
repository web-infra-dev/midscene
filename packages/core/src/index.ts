import { z } from 'zod';
import Service from './service/index';
import { TaskRunner } from './task-runner';
import { getVersion } from './utils';

export {
  plan,
  AiLocateElement,
  getMidsceneLocationSchema,
  type MidsceneLocationResultType,
  PointSchema,
  SizeSchema,
  RectSchema,
  TMultimodalPromptSchema,
  TUserPromptSchema,
  type TMultimodalPrompt,
  type TUserPrompt,
} from './ai-model/index';

export {
  MIDSCENE_MODEL_NAME,
  type CreateOpenAIClientFn,
} from '@midscene/shared/env';

export type * from './types';
export {
  ServiceError,
  ExecutionDump,
  GroupedActionDump,
  type IExecutionDump,
  type IGroupedActionDump,
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
  MidsceneYamlScriptEnv,
  LocateOption,
  DetailedLocateParam,
} from './yaml';

export { Agent, type AgentOpt, type AiActOptions, createAgent } from './agent';

// Dump utilities
export {
  restoreImageReferences,
  escapeContent,
  unescapeContent,
  parseImageScripts,
  parseDumpScript,
  parseDumpScriptAttributes,
  generateImageScriptTag,
  generateDumpScriptTag,
  writeScreenshotsToFiles,
  buildImageMapFromFiles,
} from './dump';

// Report generator
export type { IReportGenerator } from './report-generator';
export { ReportGenerator, nullReportGenerator } from './report-generator';

// ScreenshotItem
export { ScreenshotItem } from './screenshot-item';
