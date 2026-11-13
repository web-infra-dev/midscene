import path from 'node:path';
import { progress } from '@clack/prompts';
import { loadTestcases, runBenchmark } from '@midscene/benchmark-grounding';
import { Command } from 'commander';
import dotenv from 'dotenv';
import c from 'tinyrainbow';
import { z } from 'zod';
import { modelCallConfigSchema, reportMetaSchema } from '../src/core/schemas';
import { formatDuration, printHeader, printResult, write } from './output';
import { writeReport } from './report';

const integer = z.coerce.number().int().positive();
const formatTokens = (value?: number | null) =>
  value?.toLocaleString('en-US', { maximumFractionDigits: 0 }) ?? '—';

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
      printHeader('RUN');
      write(c.dim(' Loading and validating testcases...'));
      const testcases = await loadTestcases({
        directory: options.testcases,
        names: options.names,
      });
      const total = models.length * testcases.length;
      write(
        ` ${c.bold('Models')} ${models.length} ${c.dim('·')} ${c.bold('Testcases')} ${testcases.length} ${c.dim('·')} ${c.bold('Tests')} ${total}`,
        ` ${c.dim(`Concurrency ${concurrency} · Retries ${retries} · Timeout ${formatDuration(timeoutMs)}`)}`,
        ` ${c.dim(`Output ${path.resolve(options.output)}`)}`,
        '',
      );
      const startedAt = performance.now();
      const live = process.stdout.isTTY
        ? progress({
            max: total,
            size: 24,
            withGuide: false,
            onCancel: () => process.exit(130),
          })
        : undefined;
      live?.start(`Tests 0/${total}`);
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
          profiling,
          attemptCount,
          error,
        }) => {
          live?.clear();
          const state = correct
            ? 'PASS'
            : status === 'ERROR'
              ? 'ERROR'
              : 'FAIL';
          printResult(
            state,
            `${c.bold(model)} ${c.dim('>')} ${testcase} ${c.dim(`[${completed}/${total}]`)}`,
          );
          write(
            `   ${[
              `Duration ${formatDuration(profiling.durationMs)}`,
              `Tokens ${formatTokens(profiling.totalTokens)} ${c.dim(`(in ${formatTokens(profiling.totalPromptTokens)} / out ${formatTokens(profiling.totalCompletionTokens)})`)}`,
              `Attempts ${attemptCount}`,
              `Calls ${formatTokens(profiling.calls)}`,
              ...(profiling.usageStatus === 'complete'
                ? []
                : [c.yellow(`Usage ${profiling.usageStatus}`)]),
            ].join(c.dim(' · '))}`,
          );
          if (error)
            write(`   ${c.red(error.message.replaceAll('\n', '\n   '))}`);
          live?.advance();
          if (completed < total) live?.start(`Tests ${completed}/${total}`);
        },
      }).finally(() => live?.clear());
      const failed = summary.completed - summary.correct - summary.errors;
      write(
        '',
        ` ${c.bold('Models')}    ${summary.models.length}`,
        ` ${c.bold('Tests')}     ${c.green(`${summary.correct} passed`)} ${c.dim('|')} ${(failed ? c.red : c.dim)(`${failed} failed`)} ${c.dim('|')} ${(summary.errors ? c.red : c.dim)(`${summary.errors} errors`)} ${c.dim(`(${summary.completed}/${summary.planned})`)}`,
        ` ${c.bold('Duration')}  ${formatDuration(performance.now() - startedAt)}`,
        ` ${c.bold('Run')}       ${directory}`,
        '',
        ` ${c.bold('Model Summary')}`,
      );
      for (const model of summary.models) {
        write(
          '',
          ` ${c.bold(model.model)} ${c.dim(`(${model.count} tests)`)} ${c.green(`${model.passed} passed`)} ${c.dim('|')} ${(model.errors ? c.red : c.dim)(`${model.errors} errors`)}`,
          `   Avg. Duration ${formatDuration(model.duration.average)} ${c.dim('·')} Avg. Tokens ${formatTokens(model.totalTokens.average)} ${c.dim(`(in ${formatTokens(model.inputTokens.average)} / out ${formatTokens(model.outputTokens.average)})`)}`,
          `   Avg. Estimated Cost ${model.estimatedCost.average === null ? '—' : `$${model.estimatedCost.average.toFixed(6)}`} ${c.dim('·')} Usage ${model.usage.complete} complete / ${model.usage.partial} partial / ${model.usage.missing} missing`,
        );
      }
      if (options.report) {
        await writeReport({
          runDirectory: directory,
          openReport: options.open,
        });
      }
      write('');
    });
}
