import { readFileSync, readdirSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Agent } from '@midscene/core';
import { MODEL_FAMILY_VALUES } from '@midscene/shared/env';
import { encodedImageInfoOfBuffer } from '@midscene/shared/img';
import { describe, expect, test } from 'vitest';
import { z } from 'zod';

type TestCase = {
  name: string;
  platform: 'web' | 'mobile';
  instruction: Record<'en' | 'zh', string>;
  instructionLanguage: 'en' | 'zh';
  groundTruth: [number, number, number, number] | 'REFUSAL';
  reference: { image: { format: 'png' | 'jpeg' } };
};

const { models } = z
  .strictObject({
    models: z
      .array(
        z.strictObject({
          baseUrl: z.url(),
          apiKey: z.string().trim().min(1),
          family: z.enum(MODEL_FAMILY_VALUES),
          name: z.string().trim().min(1),
          protocol: z.enum(['openai-chat', 'openai-responses']).optional(),
        }),
      )
      .min(1),
  })
  .parse(JSON.parse(process.env.MIDSCENE_GROUNDING_EVALUATION_CONFIG ?? '{}'));

const testcasesDirectory = fileURLToPath(
  new URL('../testcases/', import.meta.url),
);
const outputDirectory = fileURLToPath(
  new URL(`./output/${Date.now()}/`, import.meta.url),
);

const testcases = readdirSync(testcasesDirectory, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort()
  // .slice(0, 10)
  .map(
    (name) =>
      JSON.parse(
        readFileSync(path.join(testcasesDirectory, name, 'index.json'), 'utf8'),
      ) as TestCase,
  );

describe.each(models)(
  '$name',
  { concurrent: true },
  ({ baseUrl, apiKey, family, name: modelName, protocol }) => {
    test.each(testcases)('$name', { timeout: 60 * 1000 }, async (testcase) => {
      const startedAt = Date.now();
      const instruction = testcase.instruction[testcase.instructionLanguage];
      const profiling = { durationMs: 0 };
      const { prediction, executionError } = await (async () => {
        try {
          const image = await readFile(
            path.join(
              testcasesDirectory,
              testcase.name,
              `image.${testcase.reference.image.format === 'jpeg' ? 'jpg' : 'png'}`,
            ),
          );
          const { width, height } = encodedImageInfoOfBuffer(image);
          const agent = new Agent(
            {
              interfaceType: 'static',
              actionSpace: () => [],
              screenshotBase64: async () =>
                `data:image/${testcase.reference.image.format};base64,${image.toString('base64')}`,
              size: async () => ({ width, height }),
            },
            {
              generateReport: false,
              modelConfig: {
                MIDSCENE_MODEL_BASE_URL: baseUrl,
                MIDSCENE_MODEL_API_KEY: apiKey,
                MIDSCENE_MODEL_FAMILY: family,
                MIDSCENE_MODEL_NAME: modelName,
                ...(protocol && { MIDSCENE_MODEL_PROTOCOL: protocol }),
              },
            },
          );

          try {
            return {
              prediction: {
                type: 'POINT' as const,
                ...(await agent.aiLocate(instruction)),
              },
              executionError: null,
            };
          } finally {
            Object.assign(profiling, agent.metrics);
            await agent.destroy();
          }
        } catch (error) {
          if (
            error instanceof Error &&
            'locateOutcome' in error &&
            error.locateOutcome === 'not-found'
          ) {
            return {
              prediction: { type: 'REFUSAL' as const },
              executionError: null,
            };
          }
          return {
            prediction: { type: 'ERROR' as const },
            executionError: error,
          };
        }
      })();

      const outputPath = path.join(
        outputDirectory,
        modelName.replace(/^\.+$|[^a-zA-Z0-9._-]/g, '_'),
        `${testcase.name}.json`,
      );
      profiling.durationMs = Date.now() - startedAt;
      const result = {
        input: {
          testcase: testcase.name,
          platform: testcase.platform,
          model: modelName,
          instruction,
          groundTruth: testcase.groundTruth,
        },
        output: {
          correct:
            testcase.groundTruth === 'REFUSAL'
              ? prediction.type === 'REFUSAL'
              : prediction.type === 'POINT' &&
                !!prediction.center &&
                prediction.center[0] >= testcase.groundTruth[3] &&
                prediction.center[0] <= testcase.groundTruth[1] &&
                prediction.center[1] >= testcase.groundTruth[0] &&
                prediction.center[1] <= testcase.groundTruth[2],
          ...prediction,
          ...(executionError === null ? {} : { error: String(executionError) }),
        },
        profiling,
      };
      await mkdir(path.dirname(outputPath), { recursive: true });
      await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`);

      if (executionError !== null) {
        throw executionError;
      }
      expect(result.output.correct, `Result written to ${outputPath}`).toBe(
        true,
      );
    });
  },
);
