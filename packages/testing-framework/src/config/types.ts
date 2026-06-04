/**
 * `midscene.config.ts` schema (RFC §2). Environment / target lives here, never
 * in the case YAML.
 */
import type { Agent } from '@midscene/core/agent';
import type { AgentOpt } from '@midscene/core/agent';
import type { GeneralAgentAdapter } from '../general-agent/types';
import type { RuntimeNode } from '../runtime';

/** Platforms the framework can build a UI Agent for out of the box. */
export type UIAgentType = 'web' | 'android' | 'ios' | 'computer';

/** Shared UI Agent behavior parameters (aiActContext, generateReport, ...). */
export type UIAgentOptions = AgentOpt;

/** Configuration-style UI Agent: framework builds it from `type` + `options`. */
export interface UIAgentConfig {
  type: UIAgentType;
  /** Platform connection parameters (url, deviceId, ...). */
  options?: Record<string, unknown>;
}

/** Context passed to a programmatic UI Agent factory. */
export interface UIAgentFactoryCtx {
  uiAgentOptions?: UIAgentOptions;
  env: NodeJS.ProcessEnv;
}

/** Programmatic UI Agent: the project fully controls construction. */
export type UIAgentFactory = (ctx: UIAgentFactoryCtx) => Promise<{
  agent: Agent;
  /** Optional cleanup invoked after the case finishes (close browser, etc). */
  cleanup?: () => Promise<void>;
}>;

/**
 * The single `uiAgent` field (RFC §2.1): an object means config-style, a
 * function means programmatic. One key, union type — no two ways to define a
 * run target.
 */
export type UIAgent = UIAgentConfig | UIAgentFactory;

export interface TestRunnerOptions {
  maxConcurrency?: number;
  bail?: number;
  testTimeout?: number;
  retry?: number;
}

export interface OutputOptions {
  /** Path to write the aggregate run summary JSON. */
  summary?: string;
  /** Directory for Midscene HTML reports. */
  reportDir?: string;
}

export interface MidsceneConfig {
  /** How the UI Agent is created (RFC §2.1). */
  uiAgent: UIAgent;

  // —— case discovery ——
  testDir: string;
  /** Defaults to ['**\/*.yaml']. */
  include?: string[];
  exclude?: string[];

  // —— execution policy (aligned with Rstest concepts) ——
  testRunner?: TestRunnerOptions;

  // —— output ——
  output?: OutputOptions;

  // —— shared UI Agent params ——
  uiAgentOptions?: UIAgentOptions;

  // —— extension points ——
  /** Custom YAML nodes (RFC §3). */
  runtime?: Record<string, RuntimeNode>;
  /** Replacement for the default Pi-backed general agent layer (RFC §6). */
  generalAgent?: GeneralAgentAdapter;
}

/** Defaults applied when reading a config. */
export const DEFAULT_INCLUDE = ['**/*.yaml'];
