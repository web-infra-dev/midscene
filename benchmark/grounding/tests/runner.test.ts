import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { type Server, createServer } from 'node:http';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { buildReportDataFromResultsFile } from '../dashboard/src/report-template/results-adapter.js';
import type { MidsceneResultsFileData } from '../evaluation/midscene/types.js';
import type { DatasetRow } from '../evaluation/runtime/load-data.js';

const GROUNDING_ROOT = fileURLToPath(new URL('../', import.meta.url));
const DATASET_ROOT = path.join(GROUNDING_ROOT, '_data/dataset');
const CLI_PATH = path.join(GROUNDING_ROOT, 'scripts/cli.ts');
const TSX_IMPORT = createRequire(import.meta.url).resolve('tsx');
const MOCK_API_KEY = 'grounding-test-only-key-never-persist';
const MOCK_MODEL = 'grounding-local-protocol-fixture';
const RUN_ID = 'cli-protocol-integration';

function digest(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

async function readJson<T>(filePath: string): Promise<T> {
  return JSON.parse(await readFile(filePath, 'utf8')) as T;
}

function listen(server: Server): Promise<number> {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        reject(new Error('Expected a local TCP listening address'));
        return;
      }
      resolve(address.port);
    });
  });
}

function close(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
    server.closeAllConnections();
  });
}

async function allFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map((entry) => {
      const entryPath = path.join(directory, entry.name);
      return entry.isDirectory() ? allFiles(entryPath) : [entryPath];
    }),
  );
  return nested.flat();
}

function runCli(input: {
  outputRoot: string;
  caseNames: string[];
  port: number;
}): Promise<{ code: number | null; stdout: string; stderr: string }> {
  const env = Object.fromEntries(
    Object.entries(process.env).filter(
      ([key]) =>
        !/^(MIDSCENE_|GROUNDING_|TASK_OUTPUT_|OPENAI_|LANGSMITH_|LANGCHAIN_)/.test(
          key,
        ) && !/^(HTTP_PROXY|HTTPS_PROXY|ALL_PROXY|NODE_OPTIONS)$/i.test(key),
    ),
  );
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [
        '--import',
        TSX_IMPORT,
        CLI_PATH,
        '--model',
        MOCK_MODEL,
        '--family',
        'qwen3',
        '--api-type',
        'chat-completions',
        '--cases',
        input.caseNames.join(','),
        '--concurrency',
        '1',
        '--output-dir',
        input.outputRoot,
        '--run-id',
        RUN_ID,
      ],
      {
        cwd: GROUNDING_ROOT,
        env: {
          ...env,
          MIDSCENE_MODEL_BASE_URL: `http://127.0.0.1:${input.port}/v1`,
          MIDSCENE_MODEL_API_KEY: MOCK_API_KEY,
          MIDSCENE_MODEL_RETRY_COUNT: '0',
          MIDSCENE_MODEL_REASONING_ENABLED: 'false',
          NO_PROXY: '127.0.0.1,localhost',
          NO_COLOR: '1',
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`Grounding CLI timed out.\n${stdout}\n${stderr}`));
    }, 120_000);
    child.stdout.on('data', (data: Buffer) => {
      stdout += data.toString();
    });
    child.stderr.on('data', (data: Buffer) => {
      stderr += data.toString();
    });
    child.once('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.once('close', (code) => {
      clearTimeout(timer);
      resolve({ code, stdout, stderr });
    });
  });
}

// The transport responses are deterministic fixtures, never model capability scores.
// Agent.aiLocate and the built local SDK remain real throughout this CLI test.
test(
  'CLI scores real aiLocate outcomes, keeps API failures in the denominator, and writes portable reports',
  { timeout: 150_000 },
  async () => {
    const manifest = (
      await readFile(path.join(DATASET_ROOT, 'manifest.jsonl'), 'utf8')
    )
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line) as DatasetRow);
    function pick(
      platform: DatasetRow['platform'],
      taskClass: DatasetRow['task_class'],
    ): DatasetRow {
      const row = manifest.find(
        (candidate) =>
          candidate.platform === platform && candidate.task_class === taskClass,
      );
      assert.ok(row, `Missing fixed ${platform}/${taskClass} fixture`);
      return row;
    }
    const selected = [
      pick('web', 'basic'),
      pick('mobile', 'basic'),
      pick('web', 'refusal'),
      pick('mobile', 'refusal'),
    ];
    const requestCaseNames: string[] = [];
    const serverErrors: Error[] = [];
    const server = createServer(async (request, response) => {
      try {
        assert.equal(request.method, 'POST');
        assert.equal(request.url, '/v1/chat/completions');
        assert.equal(request.headers.authorization, `Bearer ${MOCK_API_KEY}`);
        const chunks: Buffer[] = [];
        for await (const chunk of request) chunks.push(Buffer.from(chunk));
        const body = JSON.parse(Buffer.concat(chunks).toString()) as {
          model: string;
          stream?: boolean;
          messages: Array<{
            content:
              | string
              | Array<{
                  type: string;
                  text?: string;
                  image_url?: { url: string };
                }>;
          }>;
        };
        assert.equal(body.model, MOCK_MODEL);
        assert.equal(body.stream, false);
        const parts = body.messages.flatMap((message) =>
          typeof message.content === 'string'
            ? [{ type: 'text', text: message.content }]
            : message.content,
        );
        assert.ok(
          parts.some(
            (part) =>
              part.type === 'image_url' &&
              part.image_url?.url.startsWith('data:image/'),
          ),
        );
        const prompt = parts.map((part) => part.text || '').join('\n');
        const row = selected.find((candidate) =>
          prompt.includes(candidate.query),
        );
        assert.ok(
          row,
          'The real SDK request must include one selected case query',
        );
        const index = selected.indexOf(row);
        requestCaseNames.push(row.case_name);
        response.setHeader('Content-Type', 'application/json');
        if (index === 3) {
          response.writeHead(404);
          response.end(
            JSON.stringify({
              error: {
                message: 'mock route not found',
                type: 'invalid_request_error',
                code: 'not_found',
              },
            }),
          );
          return;
        }
        let bbox: number[] = [];
        if (index === 0) {
          assert.ok(row.bbox_xyxy);
          bbox = row.bbox_xyxy.map((coordinate, axis) =>
            Math.round(
              (coordinate / (axis % 2 === 0 ? row.width : row.height)) * 1000,
            ),
          );
        }
        response.end(
          JSON.stringify({
            id: `chatcmpl-fixture-${index}`,
            object: 'chat.completion',
            created: 1,
            model: MOCK_MODEL,
            choices: [
              {
                index: 0,
                message: {
                  role: 'assistant',
                  content: JSON.stringify({ bbox_2d: bbox }),
                },
                finish_reason: 'stop',
              },
            ],
            usage: {
              prompt_tokens: 10,
              completion_tokens: 10,
              total_tokens: 20,
            },
          }),
        );
      } catch (error) {
        serverErrors.push(
          error instanceof Error ? error : new Error(String(error)),
        );
        response.writeHead(500, { 'Content-Type': 'application/json' });
        response.end(
          JSON.stringify({
            error: { message: 'Mock server contract violation' },
          }),
        );
      }
    });
    const directory = await mkdtemp(
      path.join(os.tmpdir(), 'midscene-grounding-cli-'),
    );
    try {
      const port = await listen(server);
      const caseNames = selected.map((row) => row.case_name);
      const execution = await runCli({
        outputRoot: directory,
        caseNames,
        port,
      });
      assert.equal(
        execution.code,
        0,
        `${execution.stdout}\n${execution.stderr}`,
      );
      assert.deepEqual(serverErrors, []);
      assert.deepEqual(new Set(requestCaseNames), new Set(caseNames));
      for (const name of caseNames.slice(0, 3)) {
        assert.equal(
          requestCaseNames.filter((value) => value === name).length,
          1,
        );
      }
      assert.ok(!execution.stdout.includes(MOCK_API_KEY));
      assert.ok(!execution.stderr.includes(MOCK_API_KEY));
      const runDir = path.join(directory, 'runs', RUN_ID);
      const results = await readJson<MidsceneResultsFileData>(
        path.join(runDir, 'results.json'),
      );
      const state = await readJson<{
        status: string;
        progress: { total: number; completed: number };
        outcomes: { success: number; failed: number; pending: number };
      }>(path.join(runDir, 'state.json'));
      assert.equal(state.status, 'completed');
      assert.equal(state.progress.total, 4);
      assert.equal(state.progress.completed, 4);
      assert.deepEqual(state.outcomes, { success: 3, failed: 1, pending: 0 });
      assert.equal(results.progress.total, 4);
      assert.equal(results.items.length, 4);
      const items = caseNames.map((name) => {
        const item = results.items.find(
          (candidate) => candidate.caseName === name,
        );
        assert.ok(item);
        return item;
      });
      assert.deepEqual(
        items.map((item) => [item.caseName, item.finished, item.answerCorrect]),
        [
          [caseNames[0], true, true],
          [caseNames[1], true, false],
          [caseNames[2], true, true],
          [caseNames[3], false, false],
        ],
      );
      assert.equal(items[1].locateResult?.outcome, 'not-found');
      assert.equal(items[2].locateResult?.outcome, 'not-found');
      assert.notEqual(items[3].locateResult?.outcome, 'not-found');
      assert.match(items[3].error || '', /not found/i);
      const reportData = await buildReportDataFromResultsFile({
        resultsFile: results,
        loadImageMeta: async (imagePath) => {
          const record = results.cases.find((candidate) =>
            candidate.images.some(
              (image) => image.imageRelativePath === imagePath,
            ),
          );
          const row = selected.find(
            (candidate) => candidate.case_name === record?.caseName,
          );
          assert.ok(row);
          return { width: row.width, height: row.height };
        },
      });
      assert.equal(reportData.modelSummaries[0].scoreDenominator, 4);
      assert.equal(reportData.modelSummaries[0].hitCount, 2);
      assert.equal(reportData.modelSummaries[0].hitRate, 0.5);
      const files = await allFiles(runDir);
      for (const artifact of [
        'report.html',
        'report-live.html',
        'state.json',
        'results.json',
        'run-config.json',
        'midscene-main.diff',
        'dataset-snapshot.json',
      ]) {
        assert.ok(
          files.includes(path.join(runDir, artifact)),
          `Missing ${artifact}`,
        );
      }
      assert.equal(
        files.filter((file) =>
          file.startsWith(path.join(runDir, 'images') + path.sep),
        ).length,
        4,
      );
      const sourceHashes = await readJson<Record<string, string>>(
        path.join(DATASET_ROOT, 'image-hashes.json'),
      );
      for (const record of results.cases) {
        assert.equal(record.images.length, 1);
        const image = record.images[0];
        const snapshotImage = await readFile(
          path.resolve(runDir, image.imageRelativePath),
        );
        assert.equal(digest(snapshotImage), sourceHashes[record.caseName]);
      }
      for (const file of files.filter((file) =>
        /\.(json|html|diff|log)$/.test(file),
      )) {
        assert.ok(
          !(await readFile(file, 'utf8')).includes(MOCK_API_KEY),
          `Secret leaked into ${path.basename(file)}`,
        );
      }
      const html = await readFile(path.join(runDir, 'report.html'), 'utf8');
      const embedded = html.match(
        /<script[^>]*id="report-results"[^>]*>([\s\S]*?)<\/script>/,
      );
      assert.ok(embedded, 'Standalone report includes embedded result JSON');
      const embeddedResults = JSON.parse(
        embedded[1],
      ) as MidsceneResultsFileData;
      assert.equal(embeddedResults.progress.total, 4);
      assert.equal(embeddedResults.items.length, 4);
      assert.ok(
        embeddedResults.cases.every((record) =>
          record.images.every((image) =>
            image.imageRelativePath.startsWith('data:image/'),
          ),
        ),
      );
      const beforeHashes = new Map(
        await Promise.all(
          files.map(
            async (file) => [file, digest(await readFile(file))] as const,
          ),
        ),
      );
      const requestCountBeforeDuplicate = requestCaseNames.length;
      const duplicate = await runCli({
        outputRoot: directory,
        caseNames,
        port,
      });
      assert.notEqual(duplicate.code, 0, 'Duplicate run IDs must fail');
      assert.match(
        duplicate.stderr,
        /EEXIST|already exists|already has results/,
      );
      assert.equal(
        requestCaseNames.length,
        requestCountBeforeDuplicate,
        'Duplicate run must not call the model',
      );
      assert.deepEqual(await allFiles(runDir), files);
      for (const [file, previousHash] of beforeHashes) {
        assert.equal(
          digest(await readFile(file)),
          previousHash,
          `Duplicate run changed ${path.basename(file)}`,
        );
      }
    } finally {
      if (server.listening) await close(server);
      await rm(directory, { recursive: true, force: true });
    }
  },
);
