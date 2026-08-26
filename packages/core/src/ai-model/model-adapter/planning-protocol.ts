import type { DeviceAction, PlanningAction } from '@/types';
import type { JsonParser } from '../shared/json';
import type { LocateResultPromptSpec } from '../shared/model-locate-result';

export type PlanningActionOutputBuildInput = {
  actionName: string;
  param: Record<string, unknown>;
  locateFields?: string[];
  locateResultKey?: string;
};

export type ParsedPlanningLocateParameter = {
  prompt?: unknown;
  [key: string]: unknown;
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
  parseRawLocateParameter: (value: unknown) => ParsedPlanningLocateParameter;
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
  includeActionOutputExample: boolean;
  buildLocateFieldDescription: (
    locatePromptSpec?: LocateResultPromptSpec,
  ) => string;
  buildActionDescription: (
    input: PlanningActionDescriptionBuildInput,
  ) => unknown;
};

export type StandardPlanningProtocol = {
  responsePrefix?: string;
  actionSpaceProtocol: PlanningActionSpaceProtocol;
  actionOutputProtocol: PlanningActionOutputProtocol;
};

export type StandardPlanningProtocolContext = {
  jsonParser: JsonParser;
};

/**
 * Defined as a factory because planning response parsing may depend on the
 * adapter's resolved JSON parser.
 */
export type StandardPlanningProtocolFactory = (
  context: StandardPlanningProtocolContext,
) => StandardPlanningProtocol;

export type StandardPlanningProtocolDefinition =
  | StandardPlanningProtocol
  | StandardPlanningProtocolFactory;
