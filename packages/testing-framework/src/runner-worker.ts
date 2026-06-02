import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

interface WorkerInput {
  cwd: string;
  root: string;
  include: string[];
  virtualModules: Record<string, string>;
  maxConcurrency?: number;
  testTimeout?: number;
  bail?: number;
  retry?: number;
}

interface WorkerError {
  name?: string;
  message?: string;
  stack?: string;
}

interface WorkerOutput {
  ok: boolean;
  unhandledErrors: WorkerError[];
  /**
   * Failures captured from Rstest's result graph. We forward both case-level
   * errors and file/suite-level errors (e.g. a `beforeAll` hook crash) so the
   * framework can surface a meaningful message when a case never produced its
   * own result file.
   */
  testErrors: Array<{
    kind: 'case' | 'suite';
    file: string;
    testName: string;
    errors: WorkerError[];
  }>;
}

const readStdin = (): Promise<string> =>
  new Promise((resolveStdin, reject) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => {
      data += chunk;
    });
    process.stdin.on('end', () => resolveStdin(data));
    process.stdin.on('error', reject);
  });

const writeOutput = (output: WorkerOutput): void => {
  process.stdout.write(
    `__MIDSCENE_RUNNER_WORKER_RESULT__${JSON.stringify(output)}\n`,
  );
};

const main = async (): Promise<void> => {
  const raw = await readStdin();
  const input = JSON.parse(raw) as WorkerInput;

  const projectRequire = createRequire(resolve(input.root, 'package.json'));
  const rstestPkgJson = projectRequire.resolve('@rstest/core/package.json');
  const rsbuildEntry = createRequire(rstestPkgJson).resolve('@rsbuild/core');

  const [{ runRstest }, { rspack }] = await Promise.all([
    import('@rstest/core/api'),
    import(pathToFileURL(rsbuildEntry).href),
  ]);

  const maxConcurrency =
    input.maxConcurrency !== undefined
      ? Math.max(1, input.maxConcurrency)
      : undefined;

  const inlineConfig: Record<string, unknown> = {
    root: input.root,
    include: input.include,
    testEnvironment: 'node',
    reporters: [],
    ...(input.testTimeout !== undefined
      ? { testTimeout: input.testTimeout }
      : {}),
    ...(maxConcurrency !== undefined ? { maxConcurrency } : {}),
    ...(maxConcurrency !== undefined
      ? { pool: { maxWorkers: maxConcurrency, minWorkers: maxConcurrency } }
      : {}),
    ...(input.bail !== undefined ? { bail: input.bail } : {}),
    ...(input.retry !== undefined ? { retry: input.retry } : {}),
    tools: {
      rspack: (
        _config: unknown,
        { appendPlugins }: { appendPlugins: (plugin: unknown) => void },
      ) => {
        appendPlugins(
          new rspack.experiments.VirtualModulesPlugin(input.virtualModules),
        );
      },
    },
  };

  const result = await runRstest({ cwd: input.cwd, inlineConfig });

  type FormattedError = {
    name?: string;
    message?: string;
    stack?: string;
  };
  type RstestTestResult = {
    name?: string;
    testPath?: string;
    parentNames?: string[];
    status?: string;
    errors?: FormattedError[];
  };
  type RstestFileResult = RstestTestResult & {
    results?: RstestTestResult[];
  };
  type RstestRunResult = {
    ok?: boolean;
    files?: RstestFileResult[];
    unhandledErrors?: FormattedError[];
  };

  const rstestResult = (result ?? {}) as RstestRunResult;
  const unhandled = rstestResult.unhandledErrors ?? [];
  const testErrors: WorkerOutput['testErrors'] = [];

  const mapErrors = (errors: FormattedError[] | undefined): WorkerError[] =>
    (errors ?? []).map((error) => ({
      name: error.name,
      message: error.message,
      stack: error.stack,
    }));

  for (const file of rstestResult.files ?? []) {
    const filePath = file.testPath ?? '';
    // Errors that belong to the file itself (suite hooks, top-level throws).
    if (file.errors && file.errors.length > 0) {
      testErrors.push({
        kind: 'suite',
        file: filePath,
        testName: file.name ?? filePath,
        errors: mapErrors(file.errors),
      });
    }
    // Per-test results (rstest flattens cases and nested suites here).
    for (const entry of file.results ?? []) {
      if (!entry.errors || entry.errors.length === 0) continue;
      const trail = [...(entry.parentNames ?? []), entry.name ?? '']
        .filter((segment) => segment && segment.length > 0)
        .join(' > ');
      testErrors.push({
        kind: 'case',
        file: entry.testPath ?? filePath,
        testName: trail || entry.name || filePath,
        errors: mapErrors(entry.errors),
      });
    }
  }

  writeOutput({
    ok: Boolean(rstestResult.ok),
    unhandledErrors: mapErrors(unhandled),
    testErrors,
  });
};

main().catch((error) => {
  const message =
    error instanceof Error ? error.stack || error.message : String(error);
  process.stderr.write(`runner-worker fatal: ${message}\n`);
  writeOutput({
    ok: false,
    unhandledErrors: [
      {
        name: error instanceof Error ? error.name : 'WorkerError',
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      },
    ],
    testErrors: [],
  });
  process.exit(1);
});
