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

const models = z
  .array(
    z.strictObject({
      MIDSCENE_MODEL_BASE_URL: z.url(),
      MIDSCENE_MODEL_API_KEY: z.string().trim().min(1),
      MIDSCENE_MODEL_FAMILY: z.enum(MODEL_FAMILY_VALUES),
      MIDSCENE_MODEL_NAME: z.string().trim().min(1),
      MIDSCENE_MODEL_PROTOCOL: z
        .enum(['openai-chat', 'openai-responses'])
        .optional(),
    }),
  )
  .min(1)
  .parse(JSON.parse(process.env.MIDSCENE_MODELS ?? '[]'));

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
  // .slice(0, 1)
  .map(
    (name) =>
      JSON.parse(
        readFileSync(path.join(testcasesDirectory, name, 'index.json'), 'utf8'),
      ) as TestCase,
  );

describe.each(models)('$MIDSCENE_MODEL_NAME', (modelConfig) => {
  test.each(testcases)('$name', { timeout: 60 * 1000 }, async (testcase) => {
    const modelName = modelConfig.MIDSCENE_MODEL_NAME;
    const startedAt = Date.now();
    const instruction = testcase.instruction[testcase.instructionLanguage];
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
          { generateReport: false, modelConfig },
        );

        try {
          return {
            prediction: {
              outcome: 'POINT' as const,
              ...(await agent.aiLocate(instruction)),
            },
            executionError: null,
          };
        } finally {
          await agent.destroy();
        }
      } catch (error) {
        if (
          error instanceof Error &&
          'locateOutcome' in error &&
          error.locateOutcome === 'not-found'
        ) {
          return {
            prediction: { outcome: 'REFUSAL' as const },
            executionError: null,
          };
        }
        return {
          prediction: { outcome: 'ERROR' as const },
          executionError: error,
        };
      }
    })();

    const outputPath = path.join(
      outputDirectory,
      modelName.replace(/^\.+$|[^a-zA-Z0-9._-]/g, '_'),
      `${testcase.name}.json`,
    );
    const output = {
      testcase: testcase.name,
      platform: testcase.platform,
      model: modelName,
      instructionLanguage: testcase.instructionLanguage,
      instruction,
      groundTruth: testcase.groundTruth,
      prediction,
      correct:
        testcase.groundTruth === 'REFUSAL'
          ? prediction.outcome === 'REFUSAL'
          : prediction.outcome === 'POINT' &&
            !!prediction.center &&
            prediction.center[0] >= testcase.groundTruth[3] &&
            prediction.center[0] <= testcase.groundTruth[1] &&
            prediction.center[1] >= testcase.groundTruth[0] &&
            prediction.center[1] <= testcase.groundTruth[2],
      durationMs: Date.now() - startedAt,
      ...(executionError === null ? {} : { error: String(executionError) }),
    };
    await mkdir(path.dirname(outputPath), { recursive: true });
    await writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`);

    if (executionError !== null) {
      throw executionError;
    }
    expect(output.correct, `Result written to ${outputPath}`).toBe(true);
  });
});
