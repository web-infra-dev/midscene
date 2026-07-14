import { resolve } from 'node:path';
import { runWorkflowProject } from './workflow-runner';

export interface WorkflowCliIO {
  log(message: string): void;
  error(message: string): void;
}

interface ParsedWorkflowArgs {
  projectRoot: string;
  configPath?: string;
  resultDir?: string;
  mode: 'serial' | 'parallel';
  maxConcurrency?: number;
  retry?: number;
  bail?: number;
}

const readInteger = (args: string[], index: number, name: string): number => {
  const value = args[index + 1];
  if (value === undefined || !/^\d+$/.test(value)) {
    throw new Error(`${name} requires a non-negative integer.`);
  }
  return Number.parseInt(value, 10);
};

export const parseWorkflowCliArgs = (
  args: string[],
  cwd = process.cwd(),
): ParsedWorkflowArgs => {
  let projectRoot: string | undefined;
  let configPath: string | undefined;
  let resultDir: string | undefined;
  let mode: ParsedWorkflowArgs['mode'] = 'serial';
  let maxConcurrency: number | undefined;
  let retry: number | undefined;
  let bail: number | undefined;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg.startsWith('-')) {
      if (projectRoot)
        throw new Error('Only one workflow project directory is allowed.');
      projectRoot = resolve(cwd, arg);
      continue;
    }
    if (arg === '--parallel') {
      mode = 'parallel';
    } else if (arg === '--config' || arg === '--result-dir') {
      const value = args[index + 1];
      if (!value) throw new Error(`${arg} requires a path.`);
      if (arg === '--config') configPath = value;
      else resultDir = resolve(cwd, value);
      index += 1;
    } else if (
      arg === '--max-concurrency' ||
      arg === '--retry' ||
      arg === '--bail'
    ) {
      const value = readInteger(args, index, arg);
      if (arg === '--max-concurrency') {
        if (value === 0) throw new Error('--max-concurrency must be positive.');
        maxConcurrency = value;
      } else if (arg === '--retry') retry = value;
      else bail = value;
      index += 1;
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }

  return {
    projectRoot: projectRoot ?? cwd,
    configPath,
    resultDir,
    mode,
    maxConcurrency,
    retry,
    bail,
  };
};

export async function runWorkflowCli(
  args: string[],
  io: WorkflowCliIO = console,
): Promise<number> {
  try {
    const options = parseWorkflowCliArgs(args);
    const result = await runWorkflowProject(options);
    io.log(
      `midscene-workflow: ${result.rstest.stats.tests.passed}/${result.rstest.stats.tests.total} workflows passed`,
    );
    io.log(`Results: ${result.manifest.resultDir}`);
    return result.exitCode;
  } catch (error) {
    io.error(error instanceof Error ? error.message : String(error));
    return 1;
  }
}
