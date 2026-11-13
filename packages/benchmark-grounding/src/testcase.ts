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
  const testcaseSha256 = sha256Schema.parse(shaFile.toString('utf8').trim());
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
}: { directory?: string; names?: string[] } = {}): Promise<LoadedTestcase[]> {
  const root =
    directory === undefined
      ? fileURLToPath(new URL('../testcases/', import.meta.url))
      : path.resolve(directory);
  const entries = await readdir(root, { withFileTypes: true });
  const available = new Set(
    entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name),
  );
  const selected = names === undefined ? [...available] : [...names];
  if (!selected.length) throw new Error('Testcase selection is empty');
  if (new Set(selected).size !== selected.length)
    throw new Error('Duplicate testcase names in selection');
  for (const name of selected) {
    testcaseNameSchema.parse(name);
    if (!available.has(name))
      throw new Error(`Testcase ${name} does not exist in ${root}`);
  }
  return Promise.all(
    selected.sort().map(async (name) => {
      const [json, shaFile] = await Promise.all([
        readFile(path.join(root, name, 'index.json')),
        readFile(path.join(root, name, 'index.sha256')),
      ]);
      const testcase = testcaseSchema.parse(JSON.parse(json.toString('utf8')));
      const filename = imageFilename(testcase);
      const image = await readFile(path.join(root, name, filename));
      return validateLoadedTestcase(
        {
          testcase,
          testcaseSha256: shaFile.toString('utf8').trim(),
          files: {
            'index.json': json,
            'index.sha256': shaFile,
            [filename]: image,
          },
        },
        name,
      );
    }),
  );
}
