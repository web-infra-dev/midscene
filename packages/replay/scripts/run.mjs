import { channel } from 'node:diagnostics_channel';
import { mkdirSync, mkdtempSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { getMidsceneRunSubDir } from '@midscene/shared/common';
import { resolveReplayRange } from '../dist/es/experimental.mjs';
import { describeError, writeJsonFile } from '../dist/es/tooling.mjs';
import {
  collectChecks,
  loadReplay,
  loadReplayFlow,
  partialChecksReason,
  resolveReplayEntry,
  uncheckedChecks,
} from './host.mjs';
import { trackModelRequests } from './metrics.mjs';

export async function run(
  script,
  { session: sessionFile, cdp, headless, out, from, until } = {},
) {
  if (out) {
    mkdirSync(dirname(out), { recursive: true });
    mkdirSync(out);
  } else {
    out = mkdtempSync(join(getMidsceneRunSubDir('test-results'), 'replay-'));
  }
  const result = {
    ...(from === undefined && until === undefined ? { mode: 'full' } : {}),
    execution: 'failed',
    business: 'not-completed',
    actions: [],
    fallbacks: [],
    checkpoints: [],
    checks: [],
    errors: [],
  };
  const metrics = trackModelRequests();
  const stream = channel('midscene.replay');
  const collect = ({ agent, event }) => {
    if (agent !== host?.agent) return;
    if (event.type === 'action')
      result.actions.push({
        step: event.step?.id,
        action: event.action,
        dispatch: event.dispatch,
        resolvedBy: event.resolvedBy,
      });
    if (event.type === 'fallback')
      result.fallbacks.push({
        step: event.step,
        result: event.result,
        durationMs: event.durationMs,
        reason: event.reason,
      });
    if (event.type === 'checkpoint')
      result.checkpoints.push({
        step: event.step,
        title: event.title,
        status: event.status,
        actual: event.actual,
      });
  };
  let host;
  let stage = 'setup';
  let completed = false;
  stream.subscribe(collect);
  try {
    const flow = await loadReplayFlow(resolveReplayEntry(script));
    const { first, last } = resolveReplayRange(flow.steps, { from, until });
    const partial = first > 0 || last < flow.steps.length - 1;
    result.mode = partial ? 'partial' : 'full';
    const replay = await loadReplay(flow, {
      sessionFile,
      cdp,
      headless,
      generateReport: true,
    });
    result.host = replay.hostConfig;
    result.checks = uncheckedChecks(
      replay.session,
      partial ? partialChecksReason : undefined,
    );
    host = await replay.session.open({ outDir: out });
    const { agent, params } = await replay.prepare(host);
    stage = metrics.phase = 'script';
    const started = performance.now();
    try {
      try {
        result.flow = await replay.flow.run(agent, { params, from, until });
      } catch (error) {
        if (error?.outcome) result.flow = error.outcome;
        throw error;
      }
    } finally {
      result.scriptMs = Math.round(performance.now() - started);
    }
    stage = metrics.phase = 'checks';
    if (partial) {
      result.business = 'not-checked';
    } else {
      result.checks = await collectChecks(replay.session, agent, params);
      result.business = result.checks.every((check) => check.state === 'pass')
        ? 'passed'
        : 'check-failed';
    }
    completed = result.business !== 'check-failed';
  } catch (error) {
    result.errors.push(
      describeError(error, stage === 'checks' ? 'check' : stage),
    );
  } finally {
    stream.unsubscribe(collect);
    metrics.phase = 'evidence';
    try {
      result.report = await host?.agent?.flushReport?.();
      if (host && !sessionFile && !result.report && completed)
        result.errors.push(
          describeError(
            new Error(
              'REPORT_MISSING: the default host did not generate a native report',
            ),
            'report',
          ),
        );
    } catch (error) {
      result.errors.push(describeError(error, 'report'));
    }
    try {
      await host?.close?.();
    } catch (error) {
      result.errors.push(describeError(error, 'cleanup'));
    } finally {
      metrics.stop();
    }
  }
  result.requests = metrics.requests;
  if (completed && !result.errors.length) result.execution = 'passed';
  result.result = join(out, 'result.json');
  writeJsonFile(result.result, result);
  return result;
}
