import type { DeviceAction, PlanningAction } from '@/types';
import type { LocateResultPromptSpec } from '../shared/model-locate-result';

export type PlanningActionOutputBuildInput = {
  actionName: string;
  param: Record<string, unknown>;
  locateFields?: string[];
  locateResultKey?: string;
};

export type PlanningActionOutputProtocol = {
  /**
   * Ordered tag names that delimit the raw action output. The first tag must
   * have an opening tag and the last tag must have a closing tag; self-closing
   * boundary tags are not supported.
   */
  actionOutputTagNames: readonly [string, ...string[]];
  actionOutputRules: string;
  actionOutputPlaceholder: string;
  buildActionOutput: (input: PlanningActionOutputBuildInput) => string;
  parseActionOutput: (content: string) => PlanningAction | null;
};

export type PlanningActionDescriptionBuildInput = {
  action: DeviceAction<any>;
  locateFieldDescription: string;
  actionOutputExample?: string;
};

export type PlanningActionSpaceFormat = 'yaml' | 'jsonl';

export type PlanningActionSpaceProtocol = {
  title: string;
  format: PlanningActionSpaceFormat;
  buildLocateFieldDescription: (
    locatePromptSpec?: LocateResultPromptSpec,
  ) => string;
  buildActionDescription: (
    input: PlanningActionDescriptionBuildInput,
  ) => unknown;
};

export type StandardPlanningProtocol = {
  actionSpaceProtocol: PlanningActionSpaceProtocol;
  actionOutputProtocol: PlanningActionOutputProtocol;
};
