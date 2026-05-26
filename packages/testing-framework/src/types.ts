import type { MidsceneYamlFlowItem } from '@midscene/core';

export type FrameworkTargetType = 'web' | 'android' | 'ios' | 'computer';

export interface FrameworkTargetConfig {
  type: FrameworkTargetType;
  options?: Record<string, unknown>;
}

export interface FrameworkAgent {
  runYaml: (yamlScriptContent: string) => Promise<unknown>;
}

export interface FrameworkSetupResult {
  agent: FrameworkAgent;
  teardown?: () => Promise<void>;
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
  output?: {
    summary?: string;
    reportDir?: string;
  };
  agentOptions?: Record<string, unknown>;
  setup?: (context: {
    agentOptions: Record<string, unknown>;
  }) => Promise<FrameworkSetupResult>;
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
  tasks: Array<{
    name: string;
    flow: MidsceneYamlFlowItem[];
    continueOnError?: boolean;
  }>;
  raw: Record<string, unknown>;
}
