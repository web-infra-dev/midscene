import { z } from 'zod';
import Service from './service/index';
import { TaskRunner } from './task-runner';
import { getVersion } from './utils';

export {
  plan,
  describeUserPage,
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
export { ServiceError } from './types';

export { z };

export default Service;
export { TaskRunner, Service, getVersion };

export { ScreenshotItem } from './screenshot-item';
export { restoreImageReferences } from './dump';
export type {
  SerializableGroupedActionDump,
  SerializableExecutionDump,
} from './dump';
export type { StorageProvider } from './storage';
export { MemoryStorage, FileStorage } from './storage';

export type { RawUIContextData } from './agent/utils';

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
