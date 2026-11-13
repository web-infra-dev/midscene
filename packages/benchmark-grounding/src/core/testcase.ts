import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import {
  isValidJPEGImageBuffer,
  isValidPNGImageBuffer,
} from '@midscene/shared/img';
import getSharp from '@midscene/shared/img/get-sharp';
import { z } from 'zod';
import {
  type LoadedTestcase,
  sha256Schema,
  testcaseNameSchema,
  testcaseSchema,
} from './schemas';

export const imageFilename = (testcase: LoadedTestcase['testcase']) =>
  testcase.reference.image.format === 'jpeg' ? 'image.jpg' : 'image.png';

export function cloneLoadedTestcases(
  records: LoadedTestcase[],
): LoadedTestcase[] {
  if (!Array.isArray(records) || !records.length) {
    throw new Error('At least one testcase is required');
  }
  return records.map((record) => ({
    testcase: structuredClone(record.testcase),
    testcaseSha256: record.testcaseSha256,
    files: Object.fromEntries(
      Object.entries(record.files).map(([name, bytes]) => {
        if (!Buffer.isBuffer(bytes))
          throw new Error(`Testcase file ${name} must be a Buffer`);
        return [name, Buffer.from(bytes)];
      }),
    ),
  }));
}

export async function validateLoadedTestcase(
  record: LoadedTestcase,
  expectedName?: string,
): Promise<LoadedTestcase> {
  const json = record.files['index.json'];
  const shaFile = record.files['index.sha256'];
  if (!Buffer.isBuffer(json) || !Buffer.isBuffer(shaFile)) {
    throw new Error(
      'Testcase requires index.json and index.sha256 Buffer files',
    );
  }
  const testcase = testcaseSchema.parse(JSON.parse(json.toString('utf8')));
  if (expectedName !== undefined && testcase.name !== expectedName) {
    throw new Error(
      `Testcase name ${testcase.name} does not match directory ${expectedName}`,
    );
  }
  if (!isDeepStrictEqual(record.testcase, testcase)) {
    throw new Error(
      `Testcase ${testcase.name}: parsed testcase does not match index.json bytes`,
    );
  }
  const testcaseSha256 = sha256Schema.parse(shaFile.toString('utf8').trim(), {
    path: ['index.sha256'],
  });
  if (record.testcaseSha256 !== testcaseSha256) {
    throw new Error(
      `Testcase ${testcase.name}: supplied SHA does not match index.sha256`,
    );
  }
  const hash = (bytes: Buffer) =>
    createHash('sha256').update(bytes).digest('hex');
  if (hash(json) !== testcaseSha256) {
    throw new Error(`Testcase ${testcase.name}: index.json SHA-256 mismatch`);
  }
  const filename = imageFilename(testcase);
  const image = record.files[filename];
  if (!Buffer.isBuffer(image))
    throw new Error(`Testcase ${testcase.name}: missing ${filename}`);
  if (Object.keys(record.files).length !== 3) {
    throw new Error(
      `Testcase ${testcase.name}: expected exactly JSON, SHA and original image files`,
    );
  }
  if (hash(image) !== testcase.reference.image.sha256) {
    throw new Error(`Testcase ${testcase.name}: image SHA-256 mismatch`);
  }
  const validFormat =
    testcase.reference.image.format === 'png'
      ? isValidPNGImageBuffer(image)
      : isValidJPEGImageBuffer(image);
  if (!validFormat)
    throw new Error(
      `Testcase ${testcase.name}: image format does not match reference`,
    );
  const sharp = await getSharp();
  const { width, height } = await sharp(image).metadata();
  if (!width || !height)
    throw new Error(`Testcase ${testcase.name}: image dimensions are missing`);
  if (testcase.groundTruth !== 'REFUSAL') {
    const [top, right, bottom, left] = testcase.groundTruth;
    if (top >= bottom || left >= right || right > width || bottom > height) {
      throw new Error(
        `Testcase ${testcase.name}: groundTruth is unordered or outside the ${width}x${height} image`,
      );
    }
  }
  // This object is reparsed from the captured bytes, rather than the caller's view.
  return { testcase, testcaseSha256, files: record.files };
}

export async function loadTestcases({
  directory,
  names,
  onProgress,
}: {
  directory?: string;
  names?: string[];
  onProgress?: (progress: {
    name: string;
    testcaseSha256?: string;
    error?: Error;
  }) => void;
} = {}): Promise<LoadedTestcase[]> {
  const root =
    directory === undefined
      ? fileURLToPath(new URL('../testcases/', import.meta.url))
      : path.resolve(directory);
  const entries = await readdir(root, { withFileTypes: true }).catch(
    (cause) => {
      throw new Error(`Cannot read testcase directory: ${root}`, { cause });
    },
  );
  const available = new Set(
    entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name),
  );
  const selected = names === undefined ? [...available] : [...names];
  if (!selected.length) throw new Error('Testcase selection is empty');
  if (new Set(selected).size !== selected.length)
    throw new Error('Duplicate testcase names in selection');
  // Start all checks together, then report their results in name order.
  const checks = selected.sort().map((name) =>
    (async () => {
      testcaseNameSchema.parse(name);
      if (!available.has(name))
        throw new Error('Testcase directory does not exist');
      const [json, shaFile] = await Promise.all([
        readFile(path.join(root, name, 'index.json')),
        readFile(path.join(root, name, 'index.sha256')),
      ]);
      const testcase = testcaseSchema.parse(JSON.parse(json.toString('utf8')));
      const filename = imageFilename(testcase);
      return validateLoadedTestcase(
        {
          testcase,
          testcaseSha256: shaFile.toString('utf8').trim(),
          files: {
            'index.json': json,
            'index.sha256': shaFile,
            [filename]: await readFile(path.join(root, name, filename)),
          },
        },
        name,
      );
    })().then(
      (record) => ({ name, record }),
      (cause: unknown) => {
        const file = cause as NodeJS.ErrnoException;
        const message =
          file?.code === 'ENOENT' && typeof file.path === 'string'
            ? `Missing required file "${path.basename(file.path)}"`
            : cause instanceof z.ZodError
              ? cause.issues
                  .map(
                    (issue) =>
                      `${issue.path.join('.') || 'testcase'}: ${issue.message}`,
                  )
                  .join('; ')
              : cause instanceof SyntaxError
                ? 'index.json contains invalid JSON'
                : cause instanceof Error
                  ? cause.message.replace(`Testcase ${name}: `, '')
                  : String(cause);
        return { name, error: new Error(`${name}: ${message}`, { cause }) };
      },
    ),
  );
  const records: LoadedTestcase[] = [];
  const errors: Error[] = [];
  for (const check of checks) {
    const result = await check;
    if ('error' in result) {
      errors.push(result.error);
      onProgress?.({ name: result.name, error: result.error });
    } else {
      records.push(result.record);
      onProgress?.({
        name: result.name,
        testcaseSha256: result.record.testcaseSha256,
      });
    }
  }
  if (errors.length) {
    throw new AggregateError(
      errors,
      `Validation failed: ${selected.length - errors.length} passed, ${errors.length} failed (${selected.length} total).\n${errors.map((error) => error.message).join('\n')}`,
    );
  }
  return records;
}
