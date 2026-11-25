import { lstat, readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { chunk, sortBy } from 'es-toolkit';
import { z } from 'zod';
import { readDatasetLicense } from './dataset';
import { type ReportOverview, calculateReportOverview } from './overview';
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
  testcases: ReturnType<typeof browserTestcases>;
  evaluationId?: string;
  models?: string[];
  reportFormat?: 'static-v2';
  results?: Result[];
  meta?: ReportMeta;
  summaries?: ReportSummary;
  datasetLicenses?: string[];
} & ({ mode: 'viewer' } | { mode: 'report'; overview: ReportOverview });

export type BriefData = {
  mode: 'brief';
  evaluationId: string;
  scatter: ReportOverview['chart']['scatter'];
  firstTestcase?: string;
};

export type ReportMetrics = {
  schemaVersion: 2;
  evaluationId: string;
  summaries: ReportSummary;
  overview: ReportOverview;
};

export type ReportBundle = {
  evaluationId: string;
  html: string;
  briefHtml: string;
  metrics: ReportMetrics;
  files: Map<string, Uint8Array>;
};

function browserTestcases(
  testcases: LoadedTestcase[],
  image: (record: LoadedTestcase) => string,
) {
  return testcases.map((record) => ({
    ...record.testcase,
    image: image(record),
    testcaseSha256: record.testcaseSha256,
    indexJson: record.files['index.json'].toString('utf8'),
    indexSha256: record.files['index.sha256'].toString('utf8'),
  }));
}

export function stringifyReportData(data: UIData | BriefData | ReportMetrics) {
  return JSON.stringify(data, (key, value) =>
    key === 'outputTokensPerSecond' && value === Number.POSITIVE_INFINITY
      ? 'INFINITY'
      : value,
  );
}

async function assembleHTML(data: UIData | BriefData): Promise<string> {
  // Node entry points live alongside this prebuilt template in the installed dist.
  const template = await readFile(
    new URL(
      data.mode === 'brief' ? './brief-template.html' : './ui-template.html',
      import.meta.url,
    ),
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
    stringifyReportData(data).replace(
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

function compactOutcomes(results: Result[]) {
  const outcome = ({ output }: Result): 'passed' | 'failed' | 'error' =>
    output.type === 'ERROR' ? 'error' : output.correct ? 'passed' : 'failed';
  return Object.fromEntries(
    results.map((result) => [result.input.displayName, outcome(result)]),
  );
}

const screenshotPath = ({ reference }: LoadedTestcase['testcase']) =>
  `screenshots/${reference.image.sha256}.${reference.image.format === 'jpeg' ? 'jpg' : 'png'}`;

const resultAssetPath = (sha: string) => `results/${sha}.js`;
const resultScriptStart = (sha: string) =>
  `globalThis.__MIDSCENE_GROUNDING_RESULTS__ ??= {};\nglobalThis.__MIDSCENE_GROUNDING_RESULTS__["${sha}"] = `;
const resultScriptEnd = ';\n';

async function assembleReport({
  testcases,
  results,
  meta,
  models,
  evaluationId,
  datasetLicenses,
}: {
  testcases: LoadedTestcase[];
  results: Result[];
  meta: ReportMeta;
  models: string[];
  evaluationId: string;
  datasetLicenses?: string[];
}): Promise<ReportBundle> {
  const files: ReportBundle['files'] = new Map();
  const entries = browserTestcases(
    testcases,
    ({ testcase, files: snapshots }) => {
      const image = screenshotPath(testcase);
      files.set(image, snapshots[imageFilename(testcase)]);
      return image;
    },
  );
  const summaries = calculateSummary({
    models,
    results,
    meta,
    testcaseCount: testcases.length,
  });
  const overview = calculateReportOverview({
    summary: summaries,
    testcaseNames: entries.map(({ name }) => name),
    results,
  });
  const metrics: ReportMetrics = {
    schemaVersion: 2,
    evaluationId,
    summaries,
    overview,
  };
  const [html, briefHtml] = await Promise.all([
    assembleHTML({
      mode: 'report',
      reportFormat: 'static-v2',
      testcases: entries,
      evaluationId,
      models,
      results,
      meta,
      summaries,
      overview,
      datasetLicenses,
    }),
    assembleHTML({
      mode: 'brief',
      evaluationId,
      firstTestcase: entries[0]?.name,
      scatter: overview.chart.scatter,
    }),
  ]);
  return { evaluationId, html, briefHtml, metrics, files };
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
    testcases: browserTestcases(
      sortBy(validated, [(record) => record.testcase.name]),
      ({ testcase, files }) =>
        imageBaseUrl === undefined
          ? `data:image/${testcase.reference.image.format};base64,${files[imageFilename(testcase)].toString('base64')}`
          : `${imageBaseUrl.replace(/\/$/, '')}/${encodeURIComponent(testcase.name)}/${imageFilename(testcase)}?sha256=${testcase.reference.image.sha256}`,
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
  return { ...meta, models: meta.models, families: meta.families };
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
}: { runDirectory: string }): Promise<ReportBundle> {
  const directory = path.resolve(runDirectory);
  const datasetLicense = await readDatasetLicense(
    path.join(directory, 'LICENSE'),
  );
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
  return assembleReport({
    testcases,
    evaluationId: meta.evaluationId ?? path.basename(directory),
    models,
    results,
    meta,
    datasetLicenses:
      datasetLicense === undefined ? undefined : [datasetLicense],
  });
}

async function fetchReportResource(url: URL) {
  const response = await fetch(url);
  if (!response.ok) {
    await response.body?.cancel().catch(() => undefined);
    throw new Error(`Download failed (HTTP ${response.status})`);
  }
  return response;
}

async function readReportSource(source: string | URL) {
  if (typeof source === 'string') {
    const filename = (await stat(source)).isDirectory()
      ? path.join(source, 'index.html')
      : source;
    return {
      html: await readFile(filename, 'utf8'),
      asset: (relative: string) =>
        readFile(path.join(path.dirname(filename), relative)),
    };
  }
  const response = await fetchReportResource(source);
  const base = response.url || source.href;
  return {
    html: await response.text(),
    asset: async (relative: string) =>
      Buffer.from(
        await (
          await fetchReportResource(new URL(relative, base))
        ).arrayBuffer(),
      ),
  };
}

function decodeEmbeddedImage(
  image: string,
  testcase: LoadedTestcase['testcase'],
) {
  const prefix = `data:image/${testcase.reference.image.format};base64,`;
  const base64 = image.slice(prefix.length);
  if (
    !image.startsWith(prefix) ||
    base64.length % 4 !== 0 ||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(base64)
  ) {
    throw new Error(`Testcase ${testcase.name}: expected an embedded image`);
  }
  return Buffer.from(base64, 'base64');
}

function decodeResultAsset(script: string, sha: string, name: string) {
  const prefix = resultScriptStart(sha);
  if (!script.startsWith(prefix) || !script.endsWith(resultScriptEnd))
    throw new Error(`Invalid testcase result asset for ${name}`);
  try {
    return z
      .array(resultSchema)
      .parse(JSON.parse(script.slice(prefix.length, -resultScriptEnd.length)));
  } catch (cause) {
    throw new Error(`Invalid testcase result asset for ${name}`, { cause });
  }
}

/** Merge reports in input order; later results replace whole cells. */
export async function mergeReports({
  reportFiles,
}: { reportFiles: (string | URL)[] }): Promise<ReportBundle> {
  const sources = z
    .array(
      z.union([
        z.string().min(1),
        z
          .instanceof(URL)
          .refine(
            (url) => url.protocol === 'http:' || url.protocol === 'https:',
            { message: 'Expected an HTTP(S) report URL' },
          ),
      ]),
    )
    .min(2)
    .parse(reportFiles)
    .map((source) =>
      typeof source === 'string' ? path.resolve(source) : source,
    );
  const testcases = new Map<string, LoadedTestcase>();
  const results = new Map<string, Result>();
  const datasetLicenses = new Set<string>();
  const models = new Map<string, NonNullable<ReportMeta['models']>[string]>();
  const families = new Map<
    string,
    NonNullable<ReportMeta['families']>[string]
  >();
  // Reports contain large images. Read one at a time and keep one snapshot per name.
  for (const source of sources) {
    const label =
      typeof source === 'string' ? source : source.origin + source.pathname;
    try {
      const { html, asset } = await readReportSource(source);
      const scripts = html.matchAll(
        /<script\b(?=[^>]*\bid=["']benchmark-data["'])(?=[^>]*\btype=["']application\/json["'])[^>]*>([\s\S]*?)<\/script\s*>/gi,
      );
      const script = scripts.next().value;
      if (!script || !scripts.next().done)
        throw new Error('Expected exactly one embedded benchmark-data script');
      const data = z
        .object({
          mode: z.literal('report'),
          reportFormat: z.enum(['static-v1', 'static-v2']).optional(),
          models: z.array(z.string().min(1)).min(1),
          meta: reportMetaSchema,
          datasetLicenses: z
            .array(z.string().refine((license) => license.trim().length > 0))
            .optional(),
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
          results: z.array(resultSchema).optional(),
          outcomes: z.unknown(),
        })
        .parse(JSON.parse(script[1]));
      const externalImages = data.reportFormat !== undefined;
      const externalResults = data.reportFormat === 'static-v1';
      if (!externalResults && !data.results)
        throw new Error('Expected embedded results');
      if (externalResults && data.results)
        throw new Error('Static report results must be in separate assets');
      for (const license of data.datasetLicenses ?? [])
        datasetLicenses.add(license);
      const meta = validateReportMeta(data.meta);
      if (
        !isDeepStrictEqual(
          [...data.models].sort(),
          Object.keys(meta.models).sort(),
        )
      )
        throw new Error('Report models do not match metadata snapshot');
      const captured = new Map<string, LoadedTestcase>();
      const capturedResults = data.results ?? [];
      const capturedOutcomes = new Map<
        string,
        ReturnType<typeof compactOutcomes>
      >();
      // Bound asset reads to 16 at a time and apply cases in manifest order.
      const batches = externalImages
        ? chunk(data.testcases, 8)
        : [data.testcases];
      for (const batch of batches) {
        const assets = externalImages
          ? await Promise.all(
              batch.map(async (testcase) => {
                const expectedImage = screenshotPath(testcase);
                if (testcase.image !== expectedImage)
                  throw new Error(
                    `Testcase ${testcase.name}: expected a content-addressed screenshot path`,
                  );
                return Promise.all([
                  asset(expectedImage),
                  externalResults
                    ? asset(resultAssetPath(testcase.testcaseSha256))
                    : undefined,
                ]);
              }),
            )
          : undefined;
        for (const [
          index,
          { image, testcaseSha256, indexJson, indexSha256, ...testcase },
        ] of batch.entries()) {
          if (captured.has(testcase.name))
            throw new Error(`Duplicate testcase ${testcase.name} in report`);
          const [screenshot, resultAsset] = assets?.[index] ?? [];
          const record = await validateLoadedTestcase({
            testcase,
            testcaseSha256,
            files: {
              'index.json': Buffer.from(indexJson),
              'index.sha256': Buffer.from(indexSha256),
              [imageFilename(testcase)]:
                screenshot ?? decodeEmbeddedImage(image, testcase),
            },
          });
          const previous = testcases.get(testcase.name);
          if (previous && previous.testcaseSha256 !== record.testcaseSha256)
            throw new Error(
              `Conflicting testcase SHA-256 for ${testcase.name}`,
            );
          captured.set(testcase.name, record);
          if (!previous) testcases.set(testcase.name, record);
          if (resultAsset) {
            const caseResults = decodeResultAsset(
              resultAsset.toString('utf8'),
              testcaseSha256,
              testcase.name,
            );
            for (const result of caseResults) {
              if (result.input.testcase !== testcase.name)
                throw new Error(
                  `Result asset testcase does not match ${testcase.name}`,
                );
              capturedResults.push(result);
            }
            capturedOutcomes.set(testcase.name, compactOutcomes(caseResults));
          }
        }
      }
      if (
        externalResults &&
        !isDeepStrictEqual(data.outcomes, Object.fromEntries(capturedOutcomes))
      )
        throw new Error('Report outcomes do not match testcase result assets');
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
      for (const result of capturedResults) {
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
      const detail = cause instanceof Error ? cause.message : String(cause);
      throw new Error(
        `Cannot merge report ${label}: ${typeof source === 'string' ? detail : detail.replaceAll(source.href, label)}`,
        { cause },
      );
    }
  }
  const evaluationId = String(Date.now());
  const meta = {
    evaluationId,
    models: Object.fromEntries(models),
    families: Object.fromEntries(families),
  };
  return assembleReport({
    evaluationId,
    testcases: sortBy(
      [...testcases.values()],
      [(record) => record.testcase.name],
    ),
    models: [...models.keys()],
    results: [...results.values()],
    meta,
    datasetLicenses: datasetLicenses.size ? [...datasetLicenses] : undefined,
  });
}
