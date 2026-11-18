import { lstat, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { sortBy } from 'es-toolkit';
import { z } from 'zod';
import {
  type LoadedTestcase,
  type ReportMeta,
  type ReportSummary,
  type Result,
  reportMetaSchema,
  resultSchema,
  sha256Schema,
  testcaseSchema,
} from './schemas';
import { calculateSummary } from './summary';
import {
  cloneLoadedTestcases,
  imageFilename,
  loadTestcases,
  validateLoadedTestcase,
} from './testcase';

/** Browser payload shared by the report generator and UI. */
export type UIData = {
  mode: 'viewer' | 'report';
  testcases: ReturnType<typeof embeddedTestcases>;
  evaluationId?: string;
  models?: string[];
  results?: Result[];
  meta?: ReportMeta;
  summaries?: ReportSummary;
};

function embeddedTestcases(testcases: LoadedTestcase[], imageBaseUrl?: string) {
  return testcases.map(({ testcase, testcaseSha256, files }) => ({
    ...testcase,
    image:
      imageBaseUrl === undefined
        ? `data:image/${testcase.reference.image.format};base64,${files[imageFilename(testcase)].toString('base64')}`
        : `${imageBaseUrl.replace(/\/$/, '')}/${encodeURIComponent(testcase.name)}/${imageFilename(testcase)}?sha256=${testcase.reference.image.sha256}`,
    testcaseSha256,
    indexJson: files['index.json'].toString('utf8'),
    indexSha256: files['index.sha256'].toString('utf8'),
  }));
}

async function assembleHTML(data: UIData): Promise<string> {
  // Node entry points live alongside this prebuilt template in the installed dist.
  const template = await readFile(
    new URL('./ui-template.html', import.meta.url),
    'utf8',
  );
  const placeholder = '"__MIDSCENE_BENCHMARK_DATA__"';
  if (template.split(placeholder).length !== 2) {
    throw new Error(
      'Benchmark UI template must contain exactly one data placeholder',
    );
  }
  // Escape HTML-sensitive characters even inside an application/json script.
  return template.replace(placeholder, () =>
    JSON.stringify(data).replace(
      /[<>&\u2028\u2029]/g,
      (character) =>
        ({
          '<': '\\u003c',
          '>': '\\u003e',
          '&': '\\u0026',
          '\u2028': '\\u2028',
          '\u2029': '\\u2029',
        })[character] as string,
    ),
  );
}

export async function createViewer({
  testcases,
  imageBaseUrl,
}: { testcases: LoadedTestcase[]; imageBaseUrl?: string }): Promise<string> {
  const captured = cloneLoadedTestcases(testcases);
  const names = captured.map(({ testcase }) => testcase.name);
  if (new Set(names).size !== names.length)
    throw new Error('Duplicate testcase names');
  const validated = await Promise.all(
    captured.map((record) => validateLoadedTestcase(record)),
  );
  return assembleHTML({
    mode: 'viewer',
    testcases: embeddedTestcases(
      sortBy(validated, [(record) => record.testcase.name]),
      imageBaseUrl,
    ),
  });
}

async function ordinaryDirectory(directory: string) {
  if (!(await lstat(directory)).isDirectory()) {
    throw new Error(
      `Run snapshot must contain ordinary directories: ${directory}`,
    );
  }
}

async function readJSON(filename: string): Promise<unknown> {
  if (!(await lstat(filename)).isFile())
    throw new Error(`Run snapshot must contain regular files: ${filename}`);
  try {
    return JSON.parse(await readFile(filename, 'utf8'));
  } catch (cause) {
    throw new Error(`Cannot read run JSON ${filename}`, { cause });
  }
}

function validateReportMeta(meta: ReportMeta) {
  if (!meta.models || !meta.families)
    throw new Error(
      'Metadata snapshot must contain complete models and families maps',
    );
  const models = Object.keys(meta.models);
  if (!models.length)
    throw new Error('Metadata snapshot must contain model identities');
  for (const [displayName, model] of Object.entries(meta.models)) {
    if (
      !displayName ||
      !model.name ||
      !model.family ||
      model.displayName !== displayName
    )
      throw new Error(
        `Metadata snapshot model ${displayName}: missing model identity`,
      );
  }
  for (const [name, family] of Object.entries(meta.families)) {
    if (
      family.logo &&
      !/^https?:\/\//i.test(family.logo) &&
      !/^data:image\/(?:png|jpeg|gif|webp|svg\+xml|avif|x-icon)(?:;base64,[A-Za-z0-9+/]+={0,2}|(?:;charset=[\w-]+|;utf8)?,[^\r\n]+)$/i.test(
        family.logo,
      )
    ) {
      throw new Error(
        `Metadata snapshot family ${name}: logo must be an HTTP(S) URL or embedded image data URI`,
      );
    }
  }
  return { models: meta.models, families: meta.families };
}

function validateReportResult(
  result: Result,
  testcase: LoadedTestcase | undefined,
  meta: ReportMeta,
) {
  if (!testcase)
    throw new Error(`Missing testcase snapshot ${result.input.testcase}`);
  const input = result.input;
  const expected = testcase.testcase;
  const model = meta.models?.[input.displayName];
  if (!model || input.model !== model.name || input.family !== model.family)
    throw new Error('Result model identity does not match metadata snapshot');
  if (
    input.testcase !== expected.name ||
    input.platform !== expected.platform ||
    input.instruction !== expected.instruction[expected.instructionLanguage] ||
    !isDeepStrictEqual(input.groundTruth, expected.groundTruth)
  )
    throw new Error(
      `Result input does not match testcase snapshot ${expected.name}`,
    );
  if (result.consistency.testcaseSha256 !== testcase.testcaseSha256)
    throw new Error(
      `Result testcase SHA-256 does not match snapshot ${expected.name}`,
    );
  if (!isDeepStrictEqual(result.output, result.attempts.at(-1)!.output))
    throw new Error(
      `Result final output does not match the last attempt for ${expected.name}`,
    );
  for (const { output } of result.attempts) {
    const gt = expected.groundTruth;
    const correct =
      output.type === 'REFUSAL'
        ? gt === 'REFUSAL'
        : output.type === 'POINT' &&
          gt !== 'REFUSAL' &&
          output.center !== undefined &&
          output.center[0] >= gt[3] &&
          output.center[0] <= gt[1] &&
          output.center[1] >= gt[0] &&
          output.center[1] <= gt[2];
    if (output.correct !== correct)
      throw new Error(
        `Result correctness does not match snapshot ground truth for ${expected.name}`,
      );
  }
}

export async function createReport({
  runDirectory,
}: { runDirectory: string }): Promise<string> {
  const directory = path.resolve(runDirectory);
  const meta = validateReportMeta(
    reportMetaSchema.parse(await readJSON(path.join(directory, 'meta.json'))),
  );
  const models = Object.keys(meta.models);
  const modelsByDirectory = new Map(
    models.map((displayName) => [
      displayName.replace(/^\.+$|[^a-zA-Z0-9._-]/g, '_'),
      displayName,
    ]),
  );
  if (
    modelsByDirectory.size !== models.length ||
    new Set([...modelsByDirectory.keys()].map((name) => name.toLowerCase()))
      .size !== models.length
  )
    throw new Error('Duplicate model directories in metadata snapshot');

  const testcaseDirectory = path.join(directory, 'testcases');
  await ordinaryDirectory(testcaseDirectory);
  for (const entry of await readdir(testcaseDirectory, {
    withFileTypes: true,
  })) {
    if (!entry.isDirectory())
      throw new Error('Testcase snapshots must be ordinary directories');
    const files = await readdir(path.join(testcaseDirectory, entry.name), {
      withFileTypes: true,
    });
    if (
      files.length !== 3 ||
      files.some(
        (file) =>
          !file.isFile() ||
          !['index.json', 'index.sha256', 'image.png', 'image.jpg'].includes(
            file.name,
          ),
      )
    ) {
      throw new Error(
        'Testcase snapshots must contain exactly three regular testcase files',
      );
    }
  }
  const testcases = await loadTestcases({ directory: testcaseDirectory });
  const casesByName = new Map(
    testcases.map((testcase) => [testcase.testcase.name, testcase]),
  );
  const results: Result[] = [];
  const resultsPath = path.join(directory, 'results');
  const directories = await (async () => {
    try {
      await ordinaryDirectory(resultsPath);
      return await readdir(resultsPath, { withFileTypes: true });
    } catch (cause) {
      // A run interrupted before its first result may have no results directory.
      if ((cause as NodeJS.ErrnoException).code !== 'ENOENT') throw cause;
      return [];
    }
  })();
  for (const modelDirectory of sortBy(directories, [(entry) => entry.name])) {
    const model = modelsByDirectory.get(modelDirectory.name);
    if (!model || !modelDirectory.isDirectory())
      throw new Error('Unexpected model results directory');
    const resultsDirectory = path.join(resultsPath, modelDirectory.name);
    for (const entry of await readdir(resultsDirectory, {
      withFileTypes: true,
    })) {
      if (!entry.isFile() || !entry.name.endsWith('.json'))
        throw new Error('Unexpected result snapshot file');
      const result = resultSchema.parse(
        await readJSON(path.join(resultsDirectory, entry.name)),
      );
      const testcase = casesByName.get(result.input.testcase);
      if (!testcase || entry.name !== `${result.input.testcase}.json`)
        throw new Error(
          'Result file testcase identity does not match its filename or snapshot',
        );
      if (result.input.displayName !== model) {
        throw new Error(
          'Result model identity does not match metadata snapshot',
        );
      }
      validateReportResult(result, testcase, meta);
      results.push(result);
    }
  }
  const summaries = calculateSummary({
    models,
    testcaseCount: testcases.length,
    results,
    meta,
  });
  return assembleHTML({
    mode: 'report',
    testcases: embeddedTestcases(testcases),
    evaluationId: path.basename(directory),
    models,
    results,
    meta,
    summaries,
  });
}

/** Merge standalone reports in input order; later results replace whole cells. */
export async function mergeReports({
  reportFiles,
}: { reportFiles: string[] }): Promise<string> {
  const filenames = z
    .array(z.string().min(1))
    .min(2)
    .parse(reportFiles)
    .map((filename) => path.resolve(filename));
  const testcases = new Map<string, LoadedTestcase>();
  const results = new Map<string, Result>();
  const models = new Map<string, NonNullable<ReportMeta['models']>[string]>();
  const families = new Map<
    string,
    NonNullable<ReportMeta['families']>[string]
  >();
  // Reports contain large images. Read one at a time and keep one snapshot per name.
  for (const filename of filenames) {
    try {
      const html = await readFile(filename, 'utf8');
      const scripts = html.matchAll(
        /<script\b(?=[^>]*\bid=["']benchmark-data["'])(?=[^>]*\btype=["']application\/json["'])[^>]*>([\s\S]*?)<\/script\s*>/gi,
      );
      const script = scripts.next().value;
      if (!script || !scripts.next().done)
        throw new Error('Expected exactly one embedded benchmark-data script');
      const data = z
        .object({
          mode: z.literal('report'),
          models: z.array(z.string().min(1)).min(1),
          meta: reportMetaSchema,
          testcases: z
            .array(
              testcaseSchema.extend({
                image: z.string(),
                testcaseSha256: sha256Schema,
                indexJson: z.string(),
                indexSha256: z.string(),
              }),
            )
            .min(1),
          results: z.array(resultSchema),
        })
        .parse(JSON.parse(script[1]));
      const meta = validateReportMeta(data.meta);
      if (
        !isDeepStrictEqual(
          [...data.models].sort(),
          Object.keys(meta.models).sort(),
        )
      )
        throw new Error('Report models do not match metadata snapshot');
      const captured = new Map<string, LoadedTestcase>();
      for (const {
        image,
        testcaseSha256,
        indexJson,
        indexSha256,
        ...testcase
      } of data.testcases) {
        if (captured.has(testcase.name))
          throw new Error(`Duplicate testcase ${testcase.name} in report`);
        const prefix = `data:image/${testcase.reference.image.format};base64,`;
        const base64 = image.slice(prefix.length);
        if (
          !image.startsWith(prefix) ||
          base64.length % 4 !== 0 ||
          !/^[A-Za-z0-9+/]+={0,2}$/.test(base64)
        )
          throw new Error(
            `Testcase ${testcase.name}: expected an embedded image`,
          );
        const record = await validateLoadedTestcase({
          testcase,
          testcaseSha256,
          files: {
            'index.json': Buffer.from(indexJson),
            'index.sha256': Buffer.from(indexSha256),
            [imageFilename(testcase)]: Buffer.from(base64, 'base64'),
          },
        });
        const previous = testcases.get(testcase.name);
        if (previous && previous.testcaseSha256 !== record.testcaseSha256)
          throw new Error(`Conflicting testcase SHA-256 for ${testcase.name}`);
        captured.set(testcase.name, record);
        if (!previous) testcases.set(testcase.name, record);
      }
      for (const [displayName, model] of Object.entries(meta.models)) {
        const previous = models.get(displayName);
        if (
          previous &&
          (['name', 'family', 'protocol', 'reasoningEnabled'] as const).some(
            (key) => previous[key] !== model[key],
          )
        )
          throw new Error(`Conflicting model identity for ${displayName}`);
        models.set(displayName, model);
      }
      for (const [name, family] of Object.entries(meta.families))
        families.set(name, family);
      const cells = new Set<string>();
      for (const result of data.results) {
        validateReportResult(result, captured.get(result.input.testcase), meta);
        const key = JSON.stringify([
          result.input.displayName,
          result.input.testcase,
        ]);
        if (cells.has(key))
          throw new Error(
            `Duplicate result for ${result.input.displayName} / ${result.input.testcase}`,
          );
        cells.add(key);
        results.set(key, result);
      }
    } catch (cause) {
      throw new Error(
        `Cannot merge report ${filename}: ${cause instanceof Error ? cause.message : String(cause)}`,
        { cause },
      );
    }
  }
  const meta = {
    models: Object.fromEntries(models),
    families: Object.fromEntries(families),
  };
  const merged = {
    models: [...models.keys()],
    results: [...results.values()],
    meta,
  };
  return assembleHTML({
    mode: 'report',
    evaluationId: String(Date.now()),
    testcases: embeddedTestcases(
      sortBy([...testcases.values()], [(record) => record.testcase.name]),
    ),
    ...merged,
    summaries: calculateSummary({
      ...merged,
      testcaseCount: testcases.size,
    }),
  });
}
