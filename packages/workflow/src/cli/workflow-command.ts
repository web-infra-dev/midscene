import { resolve } from 'node:path';
import { runWorkflowProject } from './workflow-runner';

export interface WorkflowCliIO {
  log(message: string): void;
  error(message: string): void;
}

interface ParsedWorkflowArgs {
  cwd: string;
  projectRoot?: string;
  configPath?: string;
  resultDir?: string;
}

export const parseWorkflowCliArgs = (
  args: string[],
  cwd = process.cwd(),
): ParsedWorkflowArgs => {
  let projectRoot: string | undefined;
  let configPath: string | undefined;
  let resultDir: string | undefined;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg.startsWith('-')) {
      if (projectRoot)
        throw new Error('Only one workflow project directory is allowed.');
      projectRoot = resolve(cwd, arg);
      continue;
    }
    if (arg === '--config' || arg === '--result-dir') {
      const value = args[index + 1];
      if (!value) throw new Error(`${arg} requires a path.`);
      if (arg === '--config') configPath = value;
      else resultDir = resolve(cwd, value);
      index += 1;
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }

  return {
    cwd,
    projectRoot,
    configPath,
    resultDir,
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
      `midscene-workflow: ${result.summary.passed}/${result.summary.total} cases passed, ${result.summary.failed} failed, ${result.summary.notRun} not run`,
    );
    io.log(`Results: ${result.resultDir}`);
    return result.exitCode;
  } catch (error) {
    io.error(error instanceof Error ? error.message : String(error));
    return 1;
  }
}
