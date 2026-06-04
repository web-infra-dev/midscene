import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, resolve } from 'node:path';
import { getDebug } from '@midscene/shared/logger';
import { DEFAULT_INCLUDE, type MidsceneConfig } from '../config/types';
import { runCase } from '../engine/run-case';
import { PiGeneralAgent } from '../general-agent/pi-general-agent';
import type { GeneralAgentAdapter } from '../general-agent/types';
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

export interface ExecuteCaseFileOptions {
  config: MidsceneConfig;
  /** Absolute path to the case YAML file. */
  file: string;
  /** Resolved general agent backing verify/soft/agent nodes. */
  generalAgent: GeneralAgentAdapter;
  /** Root used to resolve relative paths and for skill discovery. */
  projectRoot: string;
  env: NodeJS.ProcessEnv;
}

/**
 * Execute a single case file end-to-end: parse the YAML, build the UI Agent,
 * run the flow, and tear the UI Agent down. This is the shared unit of work
 * behind both the in-process {@link runAll} loop and the Rstest worker entry
 * (`defineMidsceneCaseTest`), so a case runs identically either way.
 *
 * The `generalAgent` is owned by the caller (created/disposed there) so it can
 * be reused across cases in-process or scoped per worker under Rstest.
 */
export async function executeCaseFile(
  options: ExecuteCaseFileOptions,
): Promise<CaseResult> {
  const { config, file, generalAgent, projectRoot, env } = options;
  const source = readFileSync(file, 'utf-8');
  const parsed = parseCaseYaml(source, file);

  const { agent, cleanup } = await createUIAgent(
    config.uiAgent,
    config.uiAgentOptions,
    env,
  );

  try {
    return await runCase({
      parsed,
      file,
      uiAgent: agent,
      generalAgent,
      runtimeNodes: config.runtime ?? {},
      projectRoot,
      env,
    });
  } finally {
    await cleanup?.();
  }
}

/**
 * Resolve the discovered case files for a config (absolute paths), honoring an
 * explicit file list when provided. Shared by the in-process runner and the
 * Rstest orchestrator.
 */
export function resolveCaseFiles(
  config: MidsceneConfig,
  projectRoot: string,
  files?: string[],
): string[] {
  if (files && files.length > 0) {
    return files.map((f) => resolvePath(projectRoot, f));
  }
  const testDir = resolvePath(projectRoot, config.testDir);
  const include = config.include ?? DEFAULT_INCLUDE;
  const exclude = config.exclude ?? [];
  return discoverCases(testDir, include, exclude);
}

/** Build a {@link RunSummary} from per-case results. */
export function summarizeCases(
  cases: CaseResult[],
  startedAt: Date,
  finishedAt: Date,
): RunSummary {
  return {
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    durationMs: finishedAt.getTime() - startedAt.getTime(),
    total: cases.length,
    passed: cases.filter((c) => c.status === 'passed').length,
    failed: cases.filter((c) => c.status === 'failed').length,
    cases,
  };
}

/** Write the aggregate summary JSON to `output.summary`, if configured. */
export function writeSummaryFile(
  config: MidsceneConfig,
  projectRoot: string,
  summary: RunSummary,
): void {
  if (!config.output?.summary) return;
  const summaryPath = resolvePath(projectRoot, config.output.summary);
  mkdirSync(dirname(summaryPath), { recursive: true });
  writeFileSync(summaryPath, JSON.stringify(summary, null, 2), 'utf-8');
  debug('wrote summary', summaryPath);
}

/**
 * Run an entire suite in-process from a resolved config. This is the
 * lightweight, embeddable runner: it executes cases sequentially in the
 * current process and is handy for programmatic use and deterministic tests.
 *
 * The CLI drives cases through Rstest instead (see `runWithRstest`), which is
 * the orchestration layer for discovery, concurrency, bail, retry, and
 * reporting.
 */
export async function runAll(
  config: MidsceneConfig,
  options: RunAllOptions = {},
): Promise<RunSummary> {
  const projectRoot = options.projectRoot
    ? resolve(options.projectRoot)
    : process.cwd();
  const env = options.env ?? process.env;

  const files = resolveCaseFiles(config, projectRoot, options.files);

  debug('discovered cases', files);

  const generalAgent: GeneralAgentAdapter =
    config.generalAgent ?? new PiGeneralAgent();

  const startedAt = new Date();
  const cases: CaseResult[] = [];
  const bail = config.testRunner?.bail ?? 0;
  let failures = 0;

  try {
    for (const file of files) {
      const result = await executeCaseFile({
        config,
        file,
        generalAgent,
        projectRoot,
        env,
      });
      cases.push(result);
      if (result.status === 'failed') failures++;

      if (bail > 0 && failures >= bail) {
        debug('bail threshold reached', { bail, failures });
        break;
      }
    }
  } finally {
    await generalAgent.dispose?.();
  }

  const summary = summarizeCases(cases, startedAt, new Date());
  writeSummaryFile(config, projectRoot, summary);
  return summary;
}

function resolvePath(root: string, p: string): string {
  return isAbsolute(p) ? p : resolve(root, p);
}
