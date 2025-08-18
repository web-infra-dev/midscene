import { z } from 'zod';
import { Executor } from './ai-model/action-executor';
import Insight from './insight/index';
import { getVersion } from './utils';

export {
  plan,
  describeUserPage,
  AiLocateElement,
} from './ai-model/index';

export { getAIConfig, MIDSCENE_MODEL_NAME } from '@midscene/shared/env';

export type * from './types';

export const MidsceneLocation = z
  .object({
    midscene_location_field_flag: z.literal(true),
  })
  .passthrough();

export { z };

export type MidsceneLocationType = z.infer<typeof MidsceneLocation>;

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
