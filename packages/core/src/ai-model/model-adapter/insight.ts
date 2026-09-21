import { createDefaultInsightProtocol } from './default-insight-protocol';
import type {
  InsightAdapter,
  InsightDefinition,
  InsightProtocol,
  InsightProtocolContext,
  InsightProtocolDefinition,
} from './insight-protocol';

export function resolveInsightProtocol(
  definition: InsightProtocolDefinition | undefined,
  context: InsightProtocolContext,
): InsightProtocol {
  const protocolDefinition = definition ?? createDefaultInsightProtocol;
  return typeof protocolDefinition === 'function'
    ? protocolDefinition(context)
    : protocolDefinition;
}

export function resolveInsight(
  insight: InsightDefinition | undefined,
  context: InsightProtocolContext,
): InsightAdapter {
  return {
    protocol: resolveInsightProtocol(insight?.protocol, context),
  };
}
