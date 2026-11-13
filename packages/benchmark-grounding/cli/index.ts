#!/usr/bin/env node
import { realpathSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { networkInterfaces } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { intro, note, outro, spinner } from '@clack/prompts';
import { serve } from '@hono/node-server';
import {
  createReport,
  createViewer,
  loadTestcases,
  runBenchmark,
} from '@midscene/benchmark-grounding';
import { getDebug } from '@midscene/shared/logger';
import { Command } from 'commander';
import dotenv from 'dotenv';
import { Hono } from 'hono';
import open from 'open';
import { z } from 'zod';
import { version } from '../package.json';
import { modelCallConfigSchema, reportMetaSchema } from '../src/schemas';

const warn = getDebug('benchmark-grounding:cli', { console: true });
const integer = z.coerce.number().int().positive();

/** Both CLI entry points use exactly the same generation, write and open path. */
export async function writeReport({
  runDirectory,
  output,
  openReport = true,
}: {
  runDirectory: string;
  output?: string;
  openReport?: boolean;
}) {
  const directory = path.resolve(runDirectory);
  const filename = path.resolve(output ?? path.join(directory, 'report.html'));
  const html = await createReport({ runDirectory: directory });
  await mkdir(path.dirname(filename), { recursive: true });
  await writeFile(filename, html);
  process.stdout.write(`Report: ${filename}\n`);
  if (openReport) {
    try {
      await open(pathToFileURL(filename).href);
    } catch {
      warn(`Could not open the browser. Open the report manually: ${filename}`);
    }
  }
  return filename;
}

export async function main(argv = process.argv): Promise<number | undefined> {
  const program = new Command()
    .name('midscene-benchmark-grounding')
    .description(
      'View testcases, evaluate models and generate standalone reports.',
    )
    .version(version)
    .exitOverride();

  program
    .command('viewer')
    .description('Open a read-only testcase viewer.')
    .option(
      '--testcases <directory>',
      'Testcase directory (defaults to the bundled dataset).',
    )
    .option('--names <name...>', 'Exact testcase names to load.')
    .option('--host <host>', 'HTTP listening address.', '127.0.0.1')
    .option('--port <port>', 'HTTP listening port.', '4319')
    .option('--no-open', 'Do not open a browser.')
    .action(async (options) => {
      const port = integer.max(65535).parse(options.port);
      intro(`Midscene Grounding Benchmark · v${version}`);
      const status = spinner({
        accessible: !process.stdout.isTTY,
        onCancel: () => process.exit(130),
      });
      status.start('Loading and validating testcases');
      const selection = {
        directory: options.testcases,
        names: options.names,
      };
      try {
        const testcases = await loadTestcases(selection);
        const app = new Hono();
        app.get('/images/:name/:filename', async (context) => {
          context.header('Cache-Control', 'no-store');
          try {
            const [record] = await loadTestcases({
              directory: selection.directory,
              names: [context.req.param('name')],
            });
            const { image } = record.testcase.reference;
            const filename =
              image.format === 'jpeg' ? 'image.jpg' : 'image.png';
            if (context.req.param('filename') !== filename)
              return context.notFound();
            if (context.req.query('sha256') !== image.sha256)
              return context.text(
                'The screenshot has changed. Reload the viewer.',
                409,
              );
            context.header('Content-Type', `image/${image.format}`);
            return context.body(new Uint8Array(record.files[filename]));
          } catch (error) {
            return context.text(
              `Unable to load screenshot: ${error instanceof Error ? error.message : String(error)}`,
              500,
            );
          }
        });
        app.get('*', async (context) => {
          context.header('Cache-Control', 'no-store');
          try {
            const testcases = await loadTestcases(selection);
            return context.html(
              await createViewer({ testcases, imageBaseUrl: '/images' }),
            );
          } catch (error) {
            return context.text(
              `Unable to load testcases: ${error instanceof Error ? error.message : String(error)}`,
              500,
            );
          }
        });
        status.message('Starting the local viewer');
        const server = serve({
          fetch: app.fetch,
          hostname: options.host,
          port,
        });
        await new Promise<void>((resolve, reject) => {
          server.once('listening', resolve);
          server.once('error', reject);
        });
        const host =
          options.host === '0.0.0.0' || options.host === '::'
            ? '127.0.0.1'
            : options.host;
        const url = `http://${host.includes(':') ? `[${host}]` : host}:${port}/`;
        status.stop(`Viewer ready in ${Math.round(performance.now())} ms`);
        const network =
          options.host === '0.0.0.0' || options.host === '::'
            ? Object.values(networkInterfaces())
                .flatMap((addresses) => addresses ?? [])
                .filter(
                  (address) => address.family === 'IPv4' && !address.internal,
                )
                .map(
                  (address) => `Network:  http://${address.address}:${port}/`,
                )
            : [];
        note(
          [
            `Local:    ${url}`,
            ...network,
            `Dataset:  ${options.testcases ? path.resolve(options.testcases) : 'Bundled testcases'}`,
            `Cases:    ${testcases.length} · ${testcases.filter(({ testcase }) => testcase.platform === 'web').length} Web · ${testcases.filter(({ testcase }) => testcase.platform === 'mobile').length} Mobile`,
            'Mode:     Read-only',
          ].join('\n'),
          'Viewer',
        );
        outro('Press Ctrl+C to stop · Refresh the browser to reload testcases');
        if (options.open) {
          try {
            await open(url);
          } catch {
            warn(
              `Could not open the browser. Open the viewer manually: ${url}`,
            );
          }
        }
      } catch (error) {
        status.error('Unable to start the viewer');
        throw error;
      }
    });

  program
    .command('run')
    .description('Evaluate models, then generate and open a standalone report.')
    .requiredOption(
      '--output <directory>',
      'Output root; a timestamped run directory is created inside it.',
    )
    .option(
      '--testcases <directory>',
      'Testcase directory (defaults to the bundled dataset).',
    )
    .option('--names <name...>', 'Exact testcase names to run.')
    .option('--concurrency <number>', 'Global attempt concurrency.', '32')
    .option('--retries <number>', 'Retries after an execution error.', '2')
    .option(
      '--timeout-ms <number>',
      'Whole-attempt timeout in milliseconds.',
      '60000',
    )
    .option('--no-report', 'Skip report generation and opening.')
    .option('--no-open', 'Generate the report without opening a browser.')
    .action(async (options) => {
      dotenv.config({ path: path.resolve('.env'), override: false });
      const raw = process.env.MIDSCENE_GROUNDING_EVALUATION_CONFIG;
      if (!raw)
        throw new Error(
          'MIDSCENE_GROUNDING_EVALUATION_CONFIG must contain { models: [...], meta?: {...} }.',
        );
      const config = (() => {
        try {
          return JSON.parse(raw) as unknown;
        } catch {
          throw new Error(
            'MIDSCENE_GROUNDING_EVALUATION_CONFIG must be valid JSON.',
          );
        }
      })();
      const { models, meta } = z
        .object({
          models: z.array(modelCallConfigSchema).min(1),
          meta: reportMetaSchema.optional(),
        })
        .strict()
        .parse(config);
      const concurrency = integer.parse(options.concurrency);
      const retries = z.coerce
        .number()
        .int()
        .nonnegative()
        .parse(options.retries);
      const timeoutMs = integer.parse(options.timeoutMs);
      const testcases = await loadTestcases({
        directory: options.testcases,
        names: options.names,
      });
      const { directory, summary } = await runBenchmark({
        testcases,
        models,
        meta,
        outputDirectory: options.output,
        concurrency,
        retries,
        timeoutMs,
        onProgress: ({
          completed,
          total,
          model,
          testcase,
          status,
          correct,
        }) => {
          process.stdout.write(
            `[${completed}/${total}] ${model} · ${testcase} · ${correct ? 'Passed' : status === 'ERROR' ? 'Error' : 'Failed'}\n`,
          );
        },
      });
      process.stdout.write(
        `Run: ${directory}\nCompleted: ${summary.completed}/${summary.planned}\n`,
      );
      for (const model of summary.models) {
        process.stdout.write(
          `${model.model}: ${model.passed}/${model.count} passed; ${model.errors} errors\n`,
        );
      }
      if (options.report)
        await writeReport({
          runDirectory: directory,
          openReport: options.open,
        });
    });

  program
    .command('report')
    .description('Generate and open a standalone report from a saved run.')
    .argument(
      '<run-directory>',
      'Run directory containing snapshots and results.',
    )
    .option(
      '--output <file>',
      'HTML output file (defaults to <run-directory>/report.html).',
    )
    .option('--no-open', 'Do not open a browser.')
    .action(async (runDirectory, options) => {
      await writeReport({
        runDirectory,
        output: options.output,
        openReport: options.open,
      });
    });

  if (argv.length <= 2) {
    program.outputHelp();
    return 0;
  }
  try {
    await program.parseAsync(argv);
  } catch (error) {
    if (
      error &&
      typeof error === 'object' &&
      'code' in error &&
      ['commander.helpDisplayed', 'commander.version'].includes(
        String(error.code),
      )
    )
      return 0;
    throw error;
  }
  return program.args[0] === 'viewer' ? undefined : 0;
}

if (
  process.argv[1] &&
  import.meta.url ===
    pathToFileURL(realpathSync(path.resolve(process.argv[1]))).href
) {
  main()
    .then(async (code) => {
      if (code === undefined) return;
      // Timed-out model requests may still own sockets. Only the CLI ends its process.
      await Promise.all([
        new Promise<void>((resolve) =>
          process.stdout.write('', () => resolve()),
        ),
        new Promise<void>((resolve) =>
          process.stderr.write('', () => resolve()),
        ),
      ]);
      process.exit(code);
    })
    .catch((error: unknown) => {
      const message =
        error instanceof z.ZodError
          ? error.issues
              .map(
                (issue) =>
                  `${issue.path.join('.') || 'configuration'}: ${issue.message}`,
              )
              .join('\n')
          : error instanceof Error
            ? error.message
            : String(error);
      process.stderr.write(`${message}\n`, () => process.exit(1));
    });
}
