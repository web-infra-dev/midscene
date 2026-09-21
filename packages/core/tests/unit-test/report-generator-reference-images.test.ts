import {
  existsSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
} from 'node:fs';
import { join } from 'node:path';
import {
  parseDumpScript,
  parseImageScripts,
  unescapeContent,
} from '@/dump/html-utils';
import { restoreImageReferences } from '@/dump/screenshot-restoration';
import { ReportGenerator } from '@/report-generator';
import { ExecutionDump, type ExecutionTaskPlanningParam } from '@/types';
import { afterEach, beforeEach, describe, expect, it } from '@rstest/core';
import {
  defaultReportMeta,
  fakeBase64,
  getReportGeneratorTmpDir,
} from './test-helpers/report-generator';
import {
  countGroupedDumpScripts,
  extractGroupedDumpScripts,
} from './test-helpers/report-html';

function createPlanningExecutionWithReferenceImage(options: {
  referenceImage: string;
  taskCount: number;
  id: string;
}): ExecutionDump {
  return new ExecutionDump(
    {
      id: options.id,
      logTime: Date.now(),
      name: 'reference-image-dedup',
      tasks: Array.from({ length: options.taskCount }, (_, index) => ({
        taskId: `planning-${index}`,
        type: 'Planning' as const,
        subType: 'Plan',
        param: {
          userInstruction: {
            prompt: 'Compare the current screen with the reference image',
            images: [{ name: 'reference', url: options.referenceImage }],
          },
        },
        executor: async () => undefined,
        recorder: [],
        status: 'finished' as const,
      })),
    },
    { referenceImageUrls: [options.referenceImage] },
  );
}

type SerializedReferenceImageRef = {
  type: string;
  id: string;
  storage: string;
  path?: string;
};

type ReferenceImageDump<TImageUrl> = {
  executions: Array<{
    tasks: Array<{
      param: {
        userInstruction: {
          images: Array<{ url: TImageUrl }>;
        };
      };
    }>;
  }>;
};

type SerializedReferenceImageDump =
  ReferenceImageDump<SerializedReferenceImageRef>;
type RestoredReferenceImageDump = ReferenceImageDump<string>;

function referenceImageRefsFromDump(
  dump: SerializedReferenceImageDump,
): SerializedReferenceImageRef[] {
  return dump.executions[0].tasks.map(
    (task) => task.param.userInstruction.images[0].url,
  );
}

function firstPlanningReferenceImageUrl(execution: ExecutionDump): string {
  const param = execution.tasks[0].param as ExecutionTaskPlanningParam;
  const prompt = param.userInstruction;
  if (typeof prompt === 'string' || !prompt.images?.[0]) {
    throw new Error('Expected a planning reference image');
  }
  return prompt.images[0].url;
}

describe('ReportGenerator reference images', () => {
  let temporaryDirectory: string;

  beforeEach(() => {
    temporaryDirectory = getReportGeneratorTmpDir('report-reference-images');
  });

  afterEach(() => {
    if (existsSync(temporaryDirectory)) {
      rmSync(temporaryDirectory, { recursive: true, force: true });
    }
  });

  it('stores repeated planning reference images once', async () => {
    const reportPath = join(temporaryDirectory, 'reference-image-dedup.html');
    const generator = new ReportGenerator({
      reportPath,
      screenshotMode: 'inline',
      persistExecutionDump: true,
      autoPrint: false,
    });
    const referenceImage = fakeBase64(80_000, 'webp');
    const execution = createPlanningExecutionWithReferenceImage({
      referenceImage,
      taskCount: 20,
      id: 'reference-image-execution',
    });

    generator.onExecutionUpdate(execution, defaultReportMeta);
    await generator.finalize();

    const html = readFileSync(reportPath, 'utf-8');
    const imageMap = parseImageScripts(html);
    expect(Object.values(imageMap)).toContain(referenceImage);
    expect(html.split(referenceImage)).toHaveLength(2);

    const dumpScripts = extractGroupedDumpScripts(html);
    expect(dumpScripts).toHaveLength(1);
    const dump = JSON.parse(
      unescapeContent(dumpScripts[0].content),
    ) as SerializedReferenceImageDump;
    const imageRefs = referenceImageRefsFromDump(dump);
    expect(imageRefs).toHaveLength(20);
    expect(
      imageRefs.every(
        (ref) =>
          ref.type === 'midscene_image_url_ref' && ref.id === imageRefs[0].id,
      ),
    ).toBe(true);

    const restored = restoreImageReferences(
      dump,
      (ref) => imageMap[ref.id],
    ) as RestoredReferenceImageDump;
    expect(
      restored.executions[0].tasks.every(
        (task) => task.param.userInstruction.images[0].url === referenceImage,
      ),
    ).toBe(true);
    expect(firstPlanningReferenceImageUrl(execution)).toBe(referenceImage);

    const persistedDump = readFileSync(
      join(temporaryDirectory, '1.execution.json'),
      'utf-8',
    );
    expect(persistedDump).not.toContain(referenceImage);
    expect(persistedDump).toContain('midscene_image_url_ref');
  });

  it('rewrites only descriptors located inside images arrays', async () => {
    const reportPath = join(
      temporaryDirectory,
      'reference-image-descriptor-scope.html',
    );
    const generator = new ReportGenerator({
      reportPath,
      screenshotMode: 'inline',
      autoPrint: false,
    });
    const referenceImage = fakeBase64(1024, 'webp');
    const sharedDescriptor = { name: 'reference', url: referenceImage };
    const page = { constructor: { name: 'Page' } } as Record<string, unknown>;
    Object.defineProperty(page, 'internalState', {
      enumerable: true,
      get: () => {
        throw new Error('Page internals must remain opaque');
      },
    });
    const execution = new ExecutionDump(
      {
        id: 'descriptor-scope',
        logTime: Date.now(),
        name: 'descriptor-scope',
        tasks: [
          {
            taskId: 'action-with-images',
            type: 'Action Space',
            param: {
              images: [sharedDescriptor],
              unrelatedLink: sharedDescriptor,
              page,
            },
            executor: async () => undefined,
            recorder: [],
            status: 'finished',
          },
        ],
      },
      { referenceImageUrls: [referenceImage] },
    );

    generator.onExecutionUpdate(execution, defaultReportMeta);
    await generator.finalize();

    const serializedDump = parseDumpScript(readFileSync(reportPath, 'utf-8'));
    if (!serializedDump) throw new Error('Expected a serialized report dump');
    const taskParam = JSON.parse(serializedDump).executions[0].tasks[0].param;
    expect(taskParam.images[0].url).toMatchObject({
      type: 'midscene_image_url_ref',
    });
    expect(taskParam.unrelatedLink.url).toBe(referenceImage);
  });

  it('keeps report growth bounded across tasks and updates', async () => {
    const referenceImage = fakeBase64(128 * 1024, 'webp');
    const finalTaskCount = 20;

    const writeReport = async (name: string, taskCounts: number[]) => {
      const reportDirectory = join(temporaryDirectory, name);
      const reportPath = join(reportDirectory, 'index.html');
      const generator = new ReportGenerator({
        reportPath,
        screenshotMode: 'inline',
        persistExecutionDump: true,
        autoPrint: false,
      });

      for (const taskCount of taskCounts) {
        generator.onExecutionUpdate(
          createPlanningExecutionWithReferenceImage({
            referenceImage,
            taskCount,
            id: 'bounded-reference-image-execution',
          }),
          defaultReportMeta,
        );
        await generator.flush();
      }
      await generator.finalize();

      const executionDumpPath = join(reportDirectory, '1.execution.json');
      return {
        html: readFileSync(reportPath, 'utf-8'),
        htmlSize: statSync(reportPath).size,
        executionDump: readFileSync(executionDumpPath, 'utf-8'),
        executionDumpSize: statSync(executionDumpPath).size,
      };
    };

    const singleTask = await writeReport('single-task', [1]);
    const finalStateOnly = await writeReport('final-state-only', [
      finalTaskCount,
    ]);
    const incremental = await writeReport(
      'incremental-updates',
      Array.from({ length: finalTaskCount }, (_, index) => index + 1),
    );

    for (const report of [singleTask, finalStateOnly, incremental]) {
      expect(report.html.split(referenceImage)).toHaveLength(2);
      expect(countGroupedDumpScripts(report.html)).toBe(1);
      expect(report.executionDump).not.toContain(referenceImage);
    }

    const referenceImageBytes = Buffer.byteLength(referenceImage);
    expect(finalStateOnly.htmlSize - singleTask.htmlSize).toBeLessThan(
      referenceImageBytes,
    );
    expect(
      finalStateOnly.executionDumpSize - singleTask.executionDumpSize,
    ).toBeLessThan(referenceImageBytes);
    expect(incremental.htmlSize - finalStateOnly.htmlSize).toBeLessThan(4096);
    expect(
      Math.abs(
        incremental.executionDumpSize - finalStateOnly.executionDumpSize,
      ),
    ).toBeLessThan(1024);
  });

  it('does not append an existing reference image when reusing a report', async () => {
    const reportPath = join(temporaryDirectory, 'reuse-reference-image.html');
    const referenceImage = fakeBase64(64 * 1024, 'webp');

    for (const executionId of ['first-execution', 'second-execution']) {
      const generator = new ReportGenerator({
        reportPath,
        screenshotMode: 'inline',
        autoPrint: false,
        reuseExistingReport: true,
      });
      generator.onExecutionUpdate(
        createPlanningExecutionWithReferenceImage({
          referenceImage,
          taskCount: 1,
          id: executionId,
        }),
        defaultReportMeta,
      );
      await generator.finalize();
    }

    const html = readFileSync(reportPath, 'utf-8');
    expect(html.split(referenceImage)).toHaveLength(2);
    expect(
      Object.values(parseImageScripts(html)).filter(
        (imageUrl) => imageUrl === referenceImage,
      ),
    ).toHaveLength(1);
  });

  it('externalizes repeated reference images once in directory mode', async () => {
    const reportDirectory = join(temporaryDirectory, 'directory-report');
    const reportPath = join(reportDirectory, 'index.html');
    const generator = new ReportGenerator({
      reportPath,
      screenshotMode: 'directory',
      autoPrint: false,
    });
    const referenceImage = fakeBase64(128 * 1024, 'jpeg');
    const execution = createPlanningExecutionWithReferenceImage({
      referenceImage,
      taskCount: 50,
      id: 'directory-reference-image-execution',
    });

    generator.onExecutionUpdate(execution, defaultReportMeta);
    await generator.finalize();

    const imageFiles = readdirSync(join(reportDirectory, 'screenshots'));
    expect(imageFiles).toHaveLength(1);
    expect(imageFiles[0]).toMatch(/\.jpeg$/);

    const serializedDump = parseDumpScript(readFileSync(reportPath, 'utf-8'));
    if (!serializedDump) throw new Error('Expected a serialized report dump');
    expect(serializedDump).not.toContain(referenceImage);
    expect(Buffer.byteLength(serializedDump)).toBeLessThan(
      Buffer.byteLength(referenceImage),
    );

    const dump = JSON.parse(serializedDump) as SerializedReferenceImageDump;
    const imageRefs = referenceImageRefsFromDump(dump);
    expect(imageRefs).toHaveLength(50);
    expect(
      imageRefs.every(
        (ref) =>
          ref.type === 'midscene_image_url_ref' &&
          ref.storage === 'file' &&
          ref.path === imageRefs[0].path,
      ),
    ).toBe(true);
  });
});
