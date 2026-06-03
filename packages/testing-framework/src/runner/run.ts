import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, resolve } from 'node:path';
import { getDebug } from '@midscene/shared/logger';
import { PiAgentRuntime } from '../agent-runtime/pi-runtime';
import type { AgentRuntimeAdapter } from '../agent-runtime/types';
import { DEFAULT_INCLUDE, type MidsceneConfig } from '../config/types';
import { runCase } from '../engine/run-case';
import type { CaseResult, RunSummary } from '../types';
import { createUIAgent } from '../ui-agent/factory';
import { parseCaseYaml } from '../yaml/parse';
import { discoverCases } from './glob';

const debug = getDebug('testing-framework:runner');

export interface RunAllOptions {
  /** Root used to resolve relative paths (testDir, output). Default: cwd. */
  projectRoot?: string;
  /** Restrict to specific case files (absolute or project-relative). */
  files?: string[];
  /** Override the process environment passed to nodes/factories. */
  env?: NodeJS.ProcessEnv;
}

/**
 * Run an entire suite from a resolved config. This is the lightweight Phase 0
 * runner; Rstest wiring is out of scope (RFC scope note).
 */
export async function runAll(
  config: MidsceneConfig,
  options: RunAllOptions = {},
): Promise<RunSummary> {
  const projectRoot = options.projectRoot
    ? resolve(options.projectRoot)
    : process.cwd();
  const env = options.env ?? process.env;

  const testDir = resolvePath(projectRoot, config.testDir);
  const include = config.include ?? DEFAULT_INCLUDE;
  const exclude = config.exclude ?? [];

  const files =
    options.files && options.files.length > 0
      ? options.files.map((f) => resolvePath(projectRoot, f))
      : discoverCases(testDir, include, exclude);

  debug('discovered cases', files);

  const agentRuntime: AgentRuntimeAdapter =
    config.agentRuntime ?? new PiAgentRuntime();
  const runtimeNodes = config.runtime ?? {};

  const startedAt = new Date();
  const cases: CaseResult[] = [];
  const bail = config.testRunner?.bail ?? 0;
  let failures = 0;

  for (const file of files) {
    const source = readFileSync(file, 'utf-8');
    const parsed = parseCaseYaml(source, file);

    const { agent, cleanup } = await createUIAgent(
      config.uiAgent,
      config.uiAgentOptions,
      env,
    );

    try {
      const result = await runCase({
        parsed,
        file,
        uiAgent: agent,
        agentRuntime,
        runtimeNodes,
        projectRoot,
        env,
      });
      cases.push(result);
      if (result.status === 'failed') failures++;
    } finally {
      await cleanup?.();
    }

    if (bail > 0 && failures >= bail) {
      debug('bail threshold reached', { bail, failures });
      break;
    }
  }

  await agentRuntime.dispose?.();

  const finishedAt = new Date();
  const summary: RunSummary = {
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    durationMs: finishedAt.getTime() - startedAt.getTime(),
    total: cases.length,
    passed: cases.filter((c) => c.status === 'passed').length,
    failed: cases.filter((c) => c.status === 'failed').length,
    cases,
  };

  if (config.output?.summary) {
    const summaryPath = resolvePath(projectRoot, config.output.summary);
    mkdirSync(dirname(summaryPath), { recursive: true });
    writeFileSync(summaryPath, JSON.stringify(summary, null, 2), 'utf-8');
    debug('wrote summary', summaryPath);
  }

  return summary;
}

function resolvePath(root: string, p: string): string {
  return isAbsolute(p) ? p : resolve(root, p);
}
