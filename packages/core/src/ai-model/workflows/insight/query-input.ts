import type { TMultimodalPrompt, TUserPrompt } from '@/common';
import type { ServiceExtractParam } from '@/types';

/** Keep a query's demand and reference images together until message assembly. */
export type QueryInput = { demand: ServiceExtractParam } & TMultimodalPrompt;

export type InsightTaskType =
  | 'Query'
  | 'Boolean'
  | 'Number'
  | 'String'
  | 'Assert'
  | 'WaitFor';

export function insightResultKey(type: Exclude<InsightTaskType, 'Query'>) {
  return type === 'Assert' || type === 'WaitFor' ? 'StatementIsTruthy' : type;
}

export function queryInputFromPrompt(prompt: TUserPrompt): QueryInput {
  if (typeof prompt === 'string') {
    return { demand: prompt };
  }
  const { prompt: demand, ...multimodalPrompt } = prompt;
  return { demand, ...multimodalPrompt };
}
