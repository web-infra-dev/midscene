import { dumpActionParam } from '@/common';
import type { DeviceAction, PlanningAction } from '@/types';

const formatActionParamValue = (value: unknown): string => {
  if (typeof value === 'string') {
    return value;
  }
  if (value === null || value === undefined) {
    return String(value);
  }
  return JSON.stringify(value) ?? String(value);
};

export function buildPlanningActionLog(
  action: PlanningAction,
  actionSpace: DeviceAction<any>[],
): string {
  const actionDefinition = actionSpace.find(
    (item) => item.name === action.type,
  );

  if (!actionDefinition?.paramSchema) {
    return JSON.stringify(action);
  }

  const param = action.param;
  if (param === null || param === undefined) {
    return action.type;
  }
  if (typeof param !== 'object' || Array.isArray(param)) {
    return `${action.type} - ${formatActionParamValue(param)}`;
  }

  const paramForLog = dumpActionParam(param, actionDefinition.paramSchema);
  const paramDescription = Object.entries(paramForLog)
    .map(([key, value]) => `${key}: ${formatActionParamValue(value)}`)
    .join(', ');

  return [action.type, paramDescription].filter(Boolean).join(' - ');
}
