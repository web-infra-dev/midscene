import { stripVTControlCharacters } from 'node:util';
import type { TestRunReportMetrics } from '@midscene/core';
import { sumTestRunReportMetrics } from '@midscene/core/internal/test-runner';
import { globalConfigManager } from '@midscene/shared/env';
import type { StepRunResult } from '../engine/types';

/** Names only; do not initialize an Agent or require model credentials for custom Nodes. */
export function configuredModelNames(): { name: string; intents: string[] }[] {
  const env = globalConfigManager.getAllEnvConfig();
  const defaultName = env.MIDSCENE_MODEL_NAME;
  const models = new Map<string, string[]>();
  for (const [intent, name] of [
    ['default', defaultName],
    ['planning', env.MIDSCENE_PLANNING_MODEL_NAME || defaultName],
    ['insight', env.MIDSCENE_INSIGHT_MODEL_NAME || defaultName],
  ] as const) {
    if (!name) continue;
    const intents = models.get(name) ?? [];
    intents.push(intent);
    models.set(name, intents);
  }
  return [...models].map(([name, intents]) => ({ name, intents }));
}

/** Execution snapshots replace earlier snapshots; never add the same execution twice. */
export class CliModelUsage {
  private executions = new Map<string, TestRunReportMetrics>();
  private missing = new Set<string>();

  add(step: StepRunResult): void {
    for (const trace of step.report?.traces ?? []) {
      if (trace.metrics) {
        this.executions.set(trace.executionId, trace.metrics);
        this.missing.delete(trace.executionId);
      } else if (!this.executions.has(trace.executionId)) {
        this.missing.add(trace.executionId);
      }
    }
  }

  snapshot(): TestRunReportMetrics | undefined {
    if (!this.executions.size && !this.missing.size) return undefined;
    return sumTestRunReportMetrics(
      [...this.executions.values()],
      this.missing.size ? ['Some execution usage has not been recorded.'] : [],
    );
  }
}

export function formatTokenCount(value: number): string {
  if (value < 1000) return String(Math.round(value));
  if (value < 1_000_000) return `${(value / 1000).toFixed(1)}k`;
  return `${(value / 1_000_000).toFixed(1)}m`;
}

export function usageModelNames(metrics?: TestRunReportMetrics): string {
  const names = metrics?.models?.map((model) =>
    stripVTControlCharacters(model.modelName).replace(/\s+/g, ' ').trim(),
  );
  return names?.length
    ? names.join(', ')
    : metrics?.modelCallCount
      ? 'unknown'
      : '—';
}

export function formatTokenUsage(
  metrics?: TestRunReportMetrics,
  includeCached = true,
): string {
  if (!metrics) return '—';
  const state = (field: 'totalTokens' | 'promptTokens' | 'completionTokens') =>
    metrics.collection?.fields?.[field] ??
    metrics.collection?.status ??
    'complete';
  if (state('totalTokens') === 'unknown') return '— (usage unavailable)';
  if (
    !metrics.modelCallCount &&
    !metrics.totalTokens &&
    state('totalTokens') === 'complete'
  )
    return '0 (no model calls)';
  const count = (field: 'totalTokens' | 'promptTokens' | 'completionTokens') =>
    state(field) === 'unknown'
      ? '—'
      : `${state(field) === 'partial' ? '≥' : ''}${formatTokenCount(metrics[field])}`;
  return [
    `${count('totalTokens')} total${state('totalTokens') === 'partial' ? ' (partial)' : ''}`,
    `${count('promptTokens')} input${includeCached && metrics.cachedInputTokens ? ` (${formatTokenCount(metrics.cachedInputTokens)} cached)` : ''}`,
    `${count('completionTokens')} output`,
  ].join(' · ');
}
