import type { MidsceneYamlFlowItem } from '@midscene/core';

/**
 * Target types supported by the default framework setup. The first version of
 * the UI Testing Framework only covers the `web` and `android` targets that
 * appear in #2509 and the example project.
 */
export type FrameworkTargetType = 'web' | 'android';

export interface FrameworkTargetConfig {
  type: FrameworkTargetType;
  options?: Record<string, unknown>;
}

/**
 * Minimal agent contract the framework relies on. Any Midscene agent
 * (PlaywrightAgent, AndroidAgent, …) satisfies it because they all expose
 * `runYaml`.
 */
export interface FrameworkAgent {
  runYaml: (yamlScriptContent: string) => Promise<unknown>;
  /** Optional report path some agents expose after a run. */
  reportFile?: string | null;
}

export interface SetupContext {
  projectDir: string;
  agentOptions: Record<string, unknown>;
}

export interface FrameworkSetupResult {
  agent: FrameworkAgent;
  teardown?: () => Promise<void> | void;
  [key: string]: unknown;
}

export interface CustomYamlStepContext {
  agent: FrameworkAgent;
  state: Record<string, unknown>;
  filePath: string;
  stepIndex: number;
  stepName: string;
}

export type CustomYamlStepHandler = (
  value: unknown,
  context: CustomYamlStepContext,
) => Promise<void> | void;

export interface MidsceneFrameworkConfig {
  target?: FrameworkTargetConfig;
  testDir?: string;
  include?: string[];
  exclude?: string[];
  testRunner?: {
    maxConcurrency?: number;
    bail?: number;
    testTimeout?: number;
    retry?: number;
  };
  /**
   * Controls how the framework loads `.env` files before resolving
   * model and runtime configuration. Defaults are intentionally close to
   * `@midscene/cli`'s behaviour:
   * - `path` defaults to `[<cwd>/.env, <configDir>/.env]` (deduplicated;
   *   missing files are skipped silently).
   * - `override` defaults to `false` (existing `process.env` wins).
   * - `debug` defaults to `false`.
   *
   * Set `enabled: false` to opt out entirely (e.g. when the project handles
   * env loading on its own).
   */
  env?: {
    enabled?: boolean;
    path?: string | string[];
    override?: boolean;
    debug?: boolean;
  };
  output?: {
    summary?: string;
    reportDir?: string;
  };
  agentOptions?: Record<string, unknown>;
  setup?: (
    context: SetupContext,
  ) => Promise<FrameworkSetupResult> | FrameworkSetupResult;
  yamlSteps?: Record<string, CustomYamlStepHandler>;
}

export interface LoadedMidsceneConfig {
  path: string;
  root: string;
  config: MidsceneFrameworkConfig;
}

export interface FrameworkTestFile {
  filePath: string;
  relativePath: string;
  type: 'yaml' | 'test';
}

export interface NormalizedYamlCase {
  name: string;
  flow: MidsceneYamlFlowItem[];
  raw: Record<string, unknown>;
}

export interface FrameworkCaseResult {
  file: string;
  testName: string;
  success: boolean;
  duration: number;
  error?: string;
  report?: string;
}

export interface FrameworkSuiteSummary {
  total: number;
  passed: number;
  failed: number;
  durationMs: number;
  results: FrameworkCaseResult[];
}
