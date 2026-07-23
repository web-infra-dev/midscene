import type { AgentOpt } from '@midscene/core/agent';

export const STUDIO_AGENT_OPTION_KEYS = [
  'replanningCycleLimit',
  'waitAfterAction',
  'screenshotShrinkFactor',
] as const;

export type StudioAgentOptionKey = (typeof STUDIO_AGENT_OPTION_KEYS)[number];
export type StudioAgentOptions = Pick<AgentOpt, StudioAgentOptionKey>;

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

export function normalizeStudioAgentOptions(
  value: unknown,
): StudioAgentOptions {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  const source = value as Record<string, unknown>;
  const result: StudioAgentOptions = {};

  if (
    isFiniteNumber(source.replanningCycleLimit) &&
    Number.isInteger(source.replanningCycleLimit) &&
    source.replanningCycleLimit >= 0
  ) {
    result.replanningCycleLimit = source.replanningCycleLimit;
  }
  if (isFiniteNumber(source.waitAfterAction) && source.waitAfterAction >= 0) {
    result.waitAfterAction = source.waitAfterAction;
  }
  if (
    isFiniteNumber(source.screenshotShrinkFactor) &&
    source.screenshotShrinkFactor >= 1
  ) {
    result.screenshotShrinkFactor = source.screenshotShrinkFactor;
  }

  return result;
}
