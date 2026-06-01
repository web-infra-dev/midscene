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

interface WorkerOutput {
  ok: boolean;
  unhandledErrors: Array<{
    name?: string;
    message?: string;
    stack?: string;
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

  type UnhandledError = { name?: string; message?: string; stack?: string };
  const unhandled =
    (result as { unhandledErrors?: UnhandledError[] } | undefined)
      ?.unhandledErrors ?? [];

  writeOutput({
    ok: Boolean(result?.ok),
    unhandledErrors: unhandled.map((error) => ({
      name: error.name,
      message: error.message,
      stack: error.stack,
    })),
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
  });
  process.exit(1);
});
