const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const [coreEntry, operation, root] = process.argv.slice(2);
const req = createRequire(coreEntry);
const { generateImageScriptTag, generateDumpScriptTag } = req(
  './dump/html-utils.js',
);
const { getReportTpl } = req('./utils.js');
const { exportReportArtifact, ReportSession, TestRunReportAssembler } =
  req('./report.js');
const { ReportGenerator } = req('./report-generator.js');
const { ExecutionDump } = req('./types.js');
const { ScreenshotItem } = req('./screenshot-item.js');
const meta = {
  sdkVersion: 'fixture',
  groupName: 'memory fixture',
  modelBriefs: [],
};
const source = path.join(root, 'source.html');
const count = 96;
// Synthetic image payloads measure storage/serialization, without image decoding
// or browser/model overhead. Each payload contains one MiB of base64 text.
const runner = () => ({
  schemaVersion: 1,
  kind: 'test-runner',
  runId: 'memory',
  status: 'success',
  startedAt: new Date(0).toISOString(),
  endedAt: new Date(1000).toISOString(),
  durationMs: 1000,
  summary: {
    total: 0,
    passed: 0,
    failed: 0,
    notRun: 0,
    filtered: 0,
    collectionErrors: 0,
    documentFailures: 0,
    projectFailures: 0,
  },
  metrics: {
    modelCallCount: 0,
    modelTimeMs: 0,
    promptTokens: 0,
    cachedInputTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
  },
  projects: [],
});
async function main() {
  if (operation === 'fixture') {
    fs.writeFileSync(source, getReportTpl());
    const images = [];
    for (let i = 0; i < count; i++) {
      const prefix = Buffer.alloc(6);
      prefix.writeUInt32LE(i);
      const data = `data:image/png;base64,${prefix.toString('base64')}${'A'.repeat(1024 * 1024 - 8)}`;
      fs.appendFileSync(source, generateImageScriptTag(`image-${i}`, data));
      images.push({
        type: 'midscene_image_url_ref',
        id: `image-${i}`,
        mimeType: 'image/png',
        storage: 'inline',
      });
    }
    fs.appendFileSync(
      source,
      generateDumpScriptTag(
        JSON.stringify({
          ...meta,
          executions: [
            {
              id: 'source',
              name: 'source',
              logTime: 0,
              tasks: [
                {
                  taskId: 'images',
                  type: 'Log',
                  status: 'finished',
                  param: { images },
                  recorder: [],
                },
              ],
            },
          ],
        }),
        { 'data-group-id': 'source' },
      ),
    );
    return;
  }
  const Agent =
    operation === 'cases' ? req('./agent/agent.js').Agent : undefined;
  global.gc();
  const baseline = process.memoryUsage().heapUsed;
  let output;
  // Keep completed writers reachable while checking their retained heap.
  let retained;
  if (operation === 'append') {
    const generator = new ReportGenerator({
      reportPath: source,
      screenshotMode: 'inline',
      reuseExistingReport: true,
      autoPrint: false,
    });
    const image = ScreenshotItem.create(
      `data:image/png;base64,${'B'.repeat(1024 * 1024)}`,
      100,
    );
    generator.onExecutionUpdate(
      new ExecutionDump({
        id: 'appended',
        name: 'appended',
        logTime: 100,
        tasks: [
          {
            taskId: 'appended',
            type: 'Log',
            status: 'finished',
            param: {},
            recorder: [{ type: 'screenshot', ts: 100, screenshot: image }],
            executor: async () => {},
          },
        ],
      }),
      meta,
    );
    await generator.finalize();
    if (image.hasBase64()) throw Error('Screenshot bytes were retained');
    retained = { generator, image };
    output = source;
  } else if (operation.startsWith('test-')) {
    output = await new TestRunReportAssembler().assembleAsync({
      outputDir: path.join(root, 'out'),
      reportFileName: 'test',
      sources: [{ scopeId: 'case', sourcePath: source }],
      buildRunnerDump: runner,
      outputFormat:
        operation === 'test-external'
          ? 'html-and-external-assets'
          : 'single-html',
    });
  } else if (operation === 'cases') {
    const session = new ReportSession(path.join(root, 'records'));
    const references = [];
    const sources = [];
    const png =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAADUlEQVQImWNgYGD4DwABBAEAfbLI3wAAAABJRU5ErkJggg==';
    const runCase = async (index) => {
      const agent = new Agent(
        {
          interfaceType: 'puppeteer',
          actionSpace: () => [],
          destroy: async () => {},
        },
        {
          autoPrintReportMsg: false,
          modelConfig: {
            MIDSCENE_MODEL_NAME: 'fixture',
            MIDSCENE_MODEL_API_KEY: 'unused',
          },
        },
      );
      references.push(new WeakRef(agent));
      await agent.recordToReport(`case-${index}`, {
        content: `${index}:${'X'.repeat(512 * 1024)}`,
        screenshotBase64: png,
      });
      if (index % 2 === 0) {
        const source = await agent._createReportSource(
          `case-${index}`,
          agent.dump.executions.map((e) => e.id),
        );
        sources.push({ ...source, scopeId: `case-${index}` });
      }
      await agent.destroy();
    };
    await session.run(async () => {
      for (let i = 0; i < 24; i++) await runCase(i);
    });
    const uncollected = await session.finish();
    if (uncollected.length !== 12)
      throw Error('Uncollected diagnostics were lost');
    output = await new TestRunReportAssembler().assembleAsync({
      outputDir: path.join(root, 'out'),
      reportFileName: 'cases',
      sources: [
        ...sources,
        ...uncollected.map((source, index) => ({
          ...source,
          scopeId: `uncollected-${index}`,
        })),
      ],
      buildRunnerDump: runner,
    });
    await session.prune();
    for (let i = 0; i < 4; i++) {
      await new Promise((resolve) => setImmediate(resolve));
      global.gc();
    }
    if (references.some((ref) => ref.deref()))
      throw Error('Finished Agents are retained by the Session');
    retained = { session, references };
  } else if (operation === 'record') {
    const session = new ReportSession(path.join(root, 'records'));
    const images = [];
    await session.run(async () => {
      const writer = session.createRecorder(() => false);
      for (let i = 0; i < count; i++) {
        const prefix = Buffer.alloc(6);
        prefix.writeUInt32LE(i);
        const image = ScreenshotItem.create(
          `data:image/png;base64,${prefix.toString('base64')}${'C'.repeat(1024 * 1024 - 8)}`,
          i,
        );
        images.push(image);
        writer.onExecutionUpdate(
          new ExecutionDump({
            id: 'source',
            name: `progress-${i}`,
            logTime: i,
            tasks: [
              {
                taskId: 'progress',
                type: 'Log',
                status: 'finished',
                param: {},
                recorder: [{ type: 'screenshot', ts: i, screenshot: image }],
                executor: async () => {},
              },
            ],
          }),
          meta,
        );
      }
    });
    const sources = await session.finish();
    output = await new TestRunReportAssembler().assembleAsync({
      outputDir: path.join(root, 'out'),
      reportFileName: 'test',
      sources: sources.map((source, index) => ({
        ...source,
        scopeId: `record-${index}`,
      })),
      buildRunnerDump: runner,
    });
    await session.prune();
    if (images.some((image) => image.hasBase64()))
      throw Error('Queued progress retained screenshot bytes');
    if (fs.existsSync(path.join(root, 'records', 'data')))
      throw Error('Replaceable progress was retained');
    retained = { session, images };
  } else {
    output = await exportReportArtifact({
      reportPath: source,
      outputDir: path.join(root, 'out'),
      reportFileName: 'exported',
      outputFormat:
        operation === 'external' ? 'html-and-external-assets' : 'single-html',
    });
    if (
      operation === 'external' &&
      fs.readdirSync(path.join(path.dirname(output), 'screenshots')).length !==
        count
    )
      throw Error('Missing external images');
  }
  global.gc();
  const retainedHeapBytes = Math.max(
    0,
    process.memoryUsage().heapUsed - baseline,
  );
  if (retained?.images?.some((image) => image.hasBase64()))
    throw Error('A reachable writer retained image bytes');
  console.log(
    JSON.stringify({
      output,
      peakRssBytes: process.resourceUsage().maxRSS * 1024,
      retainedHeapBytes,
    }),
  );
}
main().catch((error) => {
  console.error(error.stack);
  process.exitCode = 1;
});
