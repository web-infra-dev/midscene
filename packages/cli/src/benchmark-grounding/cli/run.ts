import path from 'node:path';
import { progress } from '@clack/prompts';
import { Command } from 'commander';
import dotenv from 'dotenv';
import c from 'tinyrainbow';
import { z } from 'zod';
import { runBenchmark } from '../core';
import { mergeModelMeta } from '../core/metadata';
import { modelCallConfigSchema, reportMetaSchema } from '../core/schemas';
import { formatDuration, printHeader, printResult, write } from './output';
import { prepareTestcases } from './prepare';
import { writeReport } from './report';

const integer = z.coerce.number().int().positive();
const formatTokens = (value?: number | null) =>
  value?.toLocaleString('en-US', { maximumFractionDigits: 0 }) ?? '—';

export function runCommand() {
  return new Command('run')
    .description(
      'Prepare testcases, evaluate models, then generate and open a report.',
    )
    .option(
      '--output <directory>',
      'Output root; a timestamped run directory is created inside it.',
      './output',
    )
    .option(
      '--testcases <directory>',
      'Local testcase directory; skips the default dataset download.',
    )
    .option('--names <name...>', 'Exact testcase names to run.')
    .option('--concurrency <number>', 'Global attempt concurrency.', '64')
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
      const modelMeta = mergeModelMeta(meta?.models);
      const missing = models.flatMap(({ name, displayName = name }) => {
        const reference = modelMeta[displayName]?.reference;
        const fields = [
          !reference?.pricing && 'pricing',
          !reference?.performance && 'performance',
        ].filter(Boolean);
        return fields.length
          ? [
              `  - ${JSON.stringify(displayName)}: missing ${fields.join(' and ')}`,
            ]
          : [];
      });
      if (missing.length)
        throw new Error(
          [
            'Missing benchmark model metadata.',
            ...missing,
            'Add the missing fields to MIDSCENE_GROUNDING_EVALUATION_CONFIG under meta.models[displayName].reference (use name when displayName is omitted).',
          ].join('\n'),
        );
      const { testcases } = await prepareTestcases({
        directory: options.testcases,
        names: options.names,
      });
      const concurrency = integer.parse(options.concurrency);
      const retries = z.coerce
        .number()
        .int()
        .nonnegative()
        .parse(options.retries);
      const timeoutMs = integer.parse(options.timeoutMs);
      printHeader('RUN');
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
      const { directory } = await runBenchmark({
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
      write(
        '',
        ` ${c.green('✓')} Evaluation completed ${c.dim(`(${formatDuration(performance.now() - startedAt)})`)}`,
        ` Run: ${c.cyan(directory)}`,
      );
      if (options.report) {
        await writeReport({
          runDirectory: directory,
          openReport: options.open,
        });
      }
      write('');
    });
}
