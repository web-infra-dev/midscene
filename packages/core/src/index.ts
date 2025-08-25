import { z } from 'zod';
import { Executor } from './ai-model/action-executor';
import Insight from './insight/index';
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

export { getAIConfig, MIDSCENE_MODEL_NAME } from '@midscene/shared/env';

export type * from './types';

export { z };

export default Insight;
export { Executor, Insight, getVersion };

export type {
  MidsceneYamlScript,
  MidsceneYamlTask,
  MidsceneYamlFlowItem,
  MidsceneYamlFlowItemAIRightClick,
  MidsceneYamlConfigResult,
  LocateOption,
  DetailedLocateParam,
} from './yaml';

export { Agent, type PageAgentOpt } from './agent';
