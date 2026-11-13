import path from 'node:path';
import { loadTestcases, runBenchmark } from '@midscene/benchmark-grounding';
import { Command } from 'commander';
import dotenv from 'dotenv';
import { z } from 'zod';
import { modelCallConfigSchema, reportMetaSchema } from '../src/core/schemas';
import { writeReport } from './report';

const integer = z.coerce.number().int().positive();

export function runCommand() {
  return new Command('run')
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
}
