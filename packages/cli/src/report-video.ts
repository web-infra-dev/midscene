import { spawn } from 'node:child_process';
import { once } from 'node:events';
import {
  createReadStream,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { reportHTMLContent } from '@midscene/core';
import { getMidsceneRunSubDir } from '@midscene/shared/common';
import { getDebug } from '@midscene/shared/logger';
import puppeteer, { type Browser, type Page } from 'puppeteer';
import {
  DEFAULT_FFMPEG_CONCURRENCY,
  DEFAULT_FFMPEG_FPS,
  DEFAULT_FFMPEG_FRAME_FORMAT,
  type ReportVideoOptions,
  parseReportVideoArgResult,
  printReportVideoHelp,
} from './report-video-args';
import { dumpJsonReferencesFileStoredScreenshots } from './report-video-dump';
import {
  DEFAULT_JPEG_FRAME_QUALITY,
  ffmpegArgs,
  resolveFrameExtension,
  resolveFrameMimeType,
  resolveVideoFormat,
  resolveVideoOutputPath,
} from './report-video-ffmpeg';

const debug = getDebug('cli:report-video');
// Warnings should also reach the console so users notice them.
const warn = getDebug('cli:report-video', { console: true });

// Upper bound for the legacy MediaRecorder path. The ffmpeg path renders one
// frame per protocol call and is not subject to this total-video timeout.
const MEDIA_RECORDER_TIMEOUT_MS = 8 * 60 * 1000;
const FRAME_RENDER_TIMEOUT_MS = 30 * 1000;
const FRAME_PREPARE_TIMEOUT_MS = 60 * 1000;
// Keep one prepared report page alive for many frames. Preparing a page reloads
// the full report and image cache, which dominates long-report export time.
// If a page does become unhealthy, the per-frame retry path still restarts the
// browser and resumes from the failed frame.
const FFMPEG_FRAME_BATCH_SIZE = 500;
const FFMPEG_FRAME_MAX_RETRIES = 3;
const FRAME_DISPOSE_TIMEOUT_MS = 2 * 1000;
const BROWSER_CLOSE_TIMEOUT_MS = 5 * 1000;
const BATCH_PAGE_NAVIGATION_TIMEOUT_MS = 120 * 1000;

interface ReportVideoTarget {
  htmlPath: string;
  url: string;
  close: () => Promise<void>;
}

// Software-rendering flags so canvas.captureStream + MediaRecorder work in a
// headless, GPU-less environment (e.g. CI). Without a timeslice on start()
// headless Chromium also emits no data — that is handled in recordBrandedVideo.
//
// The disable-*-throttling/backgrounding flags are essential: a headless page
// reports visibilityState='hidden', which pauses requestAnimationFrame. The
// export render loop is driven by rAF, so without these the render stalls
// indefinitely (CPU drops to ~0). These keep timers and rAF running full speed.
const HEADLESS_VIDEO_ARGS = [
  '--autoplay-policy=no-user-gesture-required',
  '--use-gl=angle',
  '--use-angle=swiftshader',
  '--enable-unsafe-swiftshader',
  '--disable-background-timer-throttling',
  '--disable-backgrounding-occluded-windows',
  '--disable-renderer-backgrounding',
  '--disable-features=CalculateNativeWinOcclusion',
];

function launchReportVideoBrowser(protocolTimeout?: number): Promise<Browser> {
  return puppeteer.launch({
    headless: true,
    args: HEADLESS_VIDEO_ARGS,
    protocolTimeout,
  });
}

async function closeReportVideoBrowser(browser: Browser): Promise<void> {
  const browserProcess = browser.process();
  await Promise.race([
    browser.close().catch(() => {}),
    new Promise((resolve) => setTimeout(resolve, BROWSER_CLOSE_TIMEOUT_MS)),
  ]);
  browserProcess?.kill('SIGKILL');
}

function isDirectoryModeReportHtml(reportFilePath: string): boolean {
  return (
    path.basename(reportFilePath) === 'index.html' &&
    existsSync(path.join(path.dirname(reportFilePath), 'screenshots'))
  );
}

function contentTypeForFile(filePath: string): string {
  switch (path.extname(filePath).toLowerCase()) {
    case '.html':
      return 'text/html; charset=utf-8';
    case '.js':
      return 'text/javascript; charset=utf-8';
    case '.css':
      return 'text/css; charset=utf-8';
    case '.png':
      return 'image/png';
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.webp':
      return 'image/webp';
    case '.svg':
      return 'image/svg+xml';
    case '.wasm':
      return 'application/wasm';
    default:
      return 'application/octet-stream';
  }
}

async function createStaticReportServer(rootDir: string): Promise<{
  origin: string;
  close: () => Promise<void>;
}> {
  const root = path.resolve(rootDir);
  const server = createServer((req, res) => {
    try {
      const reqUrl = new URL(req.url ?? '/', 'http://127.0.0.1');
      const relativePath =
        decodeURIComponent(reqUrl.pathname).replace(/^\/+/, '') || 'index.html';
      const filePath = path.resolve(root, relativePath);
      if (filePath !== root && !filePath.startsWith(`${root}${path.sep}`)) {
        res.writeHead(403);
        res.end('Forbidden');
        return;
      }
      if (!existsSync(filePath) || statSync(filePath).isDirectory()) {
        res.writeHead(404);
        res.end('Not found');
        return;
      }
      res.writeHead(200, {
        'content-type': contentTypeForFile(filePath),
        'cache-control': 'no-store',
      });
      createReadStream(filePath).pipe(res);
    } catch (error) {
      res.writeHead(500);
      res.end(error instanceof Error ? error.message : 'Internal server error');
    }
  });

  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('report-video: failed to start local report server');
  }
  return {
    origin: `http://127.0.0.1:${address.port}`,
    close: () =>
      new Promise((resolve) => {
        server.close(() => resolve());
      }),
  };
}

interface VideoFrameSessionInfo {
  totalFrames: number;
  fps: number;
  width: number;
  height: number;
}

function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  message: string,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), timeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

// Resolve the input into a report HTML file.
//
// - dump JSON: wrapped straight into the current template.
// - report HTML / directory: used as-is. Old report templates are intentionally
//   not supported; regenerate the report so it includes the video export hooks.
function resolveReportHtmlFile(input: string): string {
  const resolved = path.resolve(input);
  if (!existsSync(resolved)) {
    throw new Error(`report-video: input does not exist: ${input}`);
  }

  if (input.toLowerCase().endsWith('.json')) {
    const tmpDir = mkdtempSync(path.join(tmpdir(), 'midscene-report-video-'));
    const dumpString = readFileSync(resolved, 'utf-8');
    // A dump JSON only carries the screenshots it embeds inline; screenshots
    // stored as separate files (split reports) cannot be resolved here and
    // would render blank. Surface that so it is not a silent surprise.
    if (dumpJsonReferencesFileStoredScreenshots(dumpString)) {
      warn(
        'dump JSON references file-stored screenshots that will render blank; pass the report HTML instead to keep screenshots',
      );
    }
    const html = reportHTMLContent(dumpString);
    if (!html) {
      throw new Error(
        'report-video: failed to build report HTML from dump (report template missing)',
      );
    }
    const htmlPath = path.join(tmpDir, 'report.html');
    writeFileSync(htmlPath, html);
    debug('built temp report html from dump json at %s', htmlPath);
    return htmlPath;
  }

  // HTML file or directory-mode report
  const sourceHtml =
    !input.toLowerCase().endsWith('.html') && statSync(resolved).isDirectory()
      ? path.join(resolved, 'index.html')
      : resolved;
  if (!existsSync(sourceHtml)) {
    throw new Error(`report-video: cannot find report HTML at ${sourceHtml}`);
  }

  debug('using report html directly at %s', sourceHtml);
  return sourceHtml;
}

async function prepareReportVideoTarget(
  htmlPath: string,
): Promise<ReportVideoTarget> {
  if (!isDirectoryModeReportHtml(htmlPath)) {
    return {
      htmlPath,
      url: pathToFileURL(htmlPath).href,
      close: async () => {},
    };
  }

  const rootDir = path.dirname(htmlPath);
  const server = await createStaticReportServer(rootDir);
  return {
    htmlPath,
    url: `${server.origin}/index.html`,
    close: server.close,
  };
}

async function resolveFfmpegPath(): Promise<string> {
  try {
    const mod = await import('@ffmpeg-installer/ffmpeg');
    const ffmpegPackage = (mod.default ?? mod) as { path?: string };
    if (!ffmpegPackage.path) {
      throw new Error('ffmpeg installer did not expose a binary path');
    }
    return ffmpegPackage.path;
  } catch (error) {
    throw new Error(
      `report-video: failed to load @ffmpeg-installer/ffmpeg. Reinstall @midscene/cli dependencies.${error instanceof Error ? `\n${error.message}` : ''}`,
    );
  }
}

function resolveTargetFps(
  requestedFps: number | undefined,
  sourceFps: number,
): number {
  const targetFps = requestedFps ?? Math.min(DEFAULT_FFMPEG_FPS, sourceFps);
  if (targetFps > sourceFps) {
    throw new Error(
      `report-video: --fps (${targetFps}) cannot exceed the report source fps (${sourceFps})`,
    );
  }
  return targetFps;
}

function sampledFrameCount(
  session: VideoFrameSessionInfo,
  targetFps: number,
): number {
  return Math.max(
    1,
    Math.ceil((session.totalFrames / session.fps) * targetFps),
  );
}

function sourceFrameIndexForOutputFrame(
  outputFrameIndex: number,
  session: VideoFrameSessionInfo,
  targetFps: number,
): number {
  return Math.min(
    session.totalFrames - 1,
    Math.floor((outputFrameIndex * session.fps) / targetFps),
  );
}

async function waitForReportVideoHooks(
  page: Page,
  encoder: 'ffmpeg' | 'media-recorder',
): Promise<void> {
  const hookExpression =
    encoder === 'ffmpeg'
      ? 'typeof window.__midscene_prepareVideoFrames === "function" && typeof window.__midscene_renderVideoFrameToBase64 === "function"'
      : 'typeof window.__midscene_exportVideoToBase64 === "function"';

  try {
    await page.waitForFunction(hookExpression, {
      timeout: encoder === 'ffmpeg' ? BATCH_PAGE_NAVIGATION_TIMEOUT_MS : 30_000,
    });
  } catch {
    throw new Error(
      'report-video: the report did not expose the video export hook. ' +
        'Rebuild @midscene/report so the current template is used.',
    );
  }
}

async function renderWithMediaRecorder(
  page: Page,
  opts: ReportVideoOptions,
): Promise<Buffer> {
  try {
    const base64 = (await page.evaluate(
      (o) =>
        (
          window as unknown as {
            __midscene_exportVideoToBase64: (arg: unknown) => Promise<string>;
          }
        ).__midscene_exportVideoToBase64(o),
      { index: opts.index, autoZoom: opts.autoZoom },
    )) as string;

    if (!base64) {
      throw new Error('report-video: exporter returned no video data');
    }
    return Buffer.from(base64, 'base64');
  } catch (e) {
    if (e instanceof Error && /timed out/i.test(e.message)) {
      throw new Error(
        `report-video: MediaRecorder rendering did not finish within ${MEDIA_RECORDER_TIMEOUT_MS / 1000}s. Use the default ffmpeg encoder for long reports.`,
      );
    }
    throw e;
  }
}

async function renderWithFfmpeg(
  target: ReportVideoTarget,
  opts: ReportVideoOptions,
  outputPath: string,
  format: 'webm' | 'mp4',
): Promise<void> {
  const openPreparedPage = async (
    browser: Browser,
  ): Promise<{
    page: Page;
    session: VideoFrameSessionInfo;
  }> => {
    const page = await browser.newPage();
    page.setDefaultNavigationTimeout(BATCH_PAGE_NAVIGATION_TIMEOUT_MS);
    page.on('console', (msg) => debug('[page] %s', msg.text()));
    page.on('pageerror', (err) => debug('[pageerror] %s', err.message));
    await page.goto(target.url, {
      waitUntil: 'domcontentloaded',
    });
    await waitForReportVideoHooks(page, 'ffmpeg');
    const session = (await withTimeout(
      page.evaluate(
        (o) =>
          (
            window as unknown as {
              __midscene_prepareVideoFrames: (
                arg: unknown,
              ) => Promise<VideoFrameSessionInfo>;
            }
          ).__midscene_prepareVideoFrames(o),
        { index: opts.index, autoZoom: opts.autoZoom, scale: opts.scale },
      ),
      FRAME_PREPARE_TIMEOUT_MS,
      `report-video: preparing video frames timed out after ${FRAME_PREPARE_TIMEOUT_MS / 1000}s`,
    )) as VideoFrameSessionInfo;
    await page.setViewport({
      width: session.width,
      height: session.height,
      deviceScaleFactor: 1,
    });
    return { page, session };
  };

  const closeBatchPage = async (page: Page): Promise<void> => {
    await withTimeout(
      page
        .evaluate(() =>
          (
            window as unknown as {
              __midscene_disposeVideoFrames?: () => void;
            }
          ).__midscene_disposeVideoFrames?.(),
        )
        .catch(() => {}),
      FRAME_DISPOSE_TIMEOUT_MS,
      'report-video: disposing frame renderer timed out',
    ).catch(() => {});
    await Promise.race([
      page.close().catch(() => {}),
      new Promise((resolve) => setTimeout(resolve, BROWSER_CLOSE_TIMEOUT_MS)),
    ]);
  };

  const ffmpegPath = await resolveFfmpegPath();
  let firstBrowser: Browser | null = null;
  let firstBatch: { page: Page; session: VideoFrameSessionInfo } | null = null;
  let firstBrowserAssignedToWorker = false;
  let frameDir: string | null = null;

  try {
    firstBrowser = await launchReportVideoBrowser();
    firstBatch = await openPreparedPage(firstBrowser);
    const { session } = firstBatch;
    const targetFps = resolveTargetFps(opts.fps, session.fps);
    const outputFrameCount = sampledFrameCount(session, targetFps);
    const concurrency = Math.max(
      1,
      Math.min(
        opts.concurrency ?? DEFAULT_FFMPEG_CONCURRENCY,
        outputFrameCount,
      ),
    );
    const frameFormat = opts.frameFormat ?? DEFAULT_FFMPEG_FRAME_FORMAT;
    const frameMimeType = resolveFrameMimeType(frameFormat);
    const frameQuality =
      frameFormat === 'jpeg' ? DEFAULT_JPEG_FRAME_QUALITY : undefined;
    frameDir = mkdtempSync(
      path.join(tmpdir(), 'midscene-report-video-frames-'),
    );
    const frameDirPath = frameDir;
    const frameExtension = resolveFrameExtension(frameFormat);
    const framePattern = path.join(
      frameDirPath,
      `frame-%06d.${frameExtension}`,
    );
    const progressStep = Math.max(1, Math.floor(outputFrameCount / 10));
    let nextOutputFrameIndex = 0;
    let completedFrames = 0;
    let nextProgressFrame = progressStep;
    let aborted = false;

    if (targetFps !== session.fps) {
      console.log(
        `   Sampling frames at ${targetFps}fps (source ${session.fps}fps)`,
      );
    }
    if (opts.scale && opts.scale > 1) {
      console.log(
        `   Rendering at ${session.width}×${session.height} (scale ${opts.scale})`,
      );
    }
    if (concurrency > 1) {
      console.log(`   Rendering with ${concurrency} parallel workers`);
    }

    const assertStableSession = (
      nextSession: VideoFrameSessionInfo,
      context: string,
    ) => {
      if (
        nextSession.totalFrames !== session.totalFrames ||
        nextSession.fps !== session.fps
      ) {
        throw new Error(
          `report-video: frame session changed between ${context}`,
        );
      }
    };

    const takeNextFrame = (): number | null => {
      if (aborted || nextOutputFrameIndex >= outputFrameCount) return null;
      const frameIndex = nextOutputFrameIndex;
      nextOutputFrameIndex += 1;
      return frameIndex;
    };

    const reportFrameRendered = () => {
      completedFrames += 1;
      if (
        completedFrames === 1 ||
        completedFrames === outputFrameCount ||
        completedFrames >= nextProgressFrame
      ) {
        console.log(
          `   Rendered frames: ${completedFrames}/${outputFrameCount}`,
        );
        debug('ffmpeg frame progress %d/%d', completedFrames, outputFrameCount);
        while (nextProgressFrame <= completedFrames) {
          nextProgressFrame += progressStep;
        }
      }
    };

    const renderFrameToFile = async (page: Page, outputFrameIndex: number) => {
      const sourceFrameIndex = sourceFrameIndexForOutputFrame(
        outputFrameIndex,
        session,
        targetFps,
      );
      const frameBase64 = await withTimeout(
        page.evaluate(
          (index, renderOptions) =>
            (
              window as unknown as {
                __midscene_renderVideoFrameToBase64: (
                  frameIndex: number,
                  options?: {
                    type?: 'image/jpeg' | 'image/png';
                    quality?: number;
                  },
                ) => Promise<string>;
              }
            ).__midscene_renderVideoFrameToBase64(index, renderOptions),
          sourceFrameIndex,
          {
            type: frameMimeType,
            quality: frameQuality,
          },
        ),
        FRAME_RENDER_TIMEOUT_MS,
        `report-video: rendering frame ${outputFrameIndex + 1}/${outputFrameCount} timed out after ${FRAME_RENDER_TIMEOUT_MS / 1000}s`,
      );

      writeFileSync(
        path.join(
          frameDirPath,
          `frame-${String(outputFrameIndex).padStart(6, '0')}.${frameExtension}`,
        ),
        Buffer.from(frameBase64, 'base64'),
      );
    };

    const runWorker = async (
      workerIndex: number,
      initial?: {
        browser: Browser;
        page: Page;
      },
    ) => {
      let browser = initial?.browser ?? (await launchReportVideoBrowser());
      let page: Page | null = initial?.page ?? null;
      let framesOnCurrentPage = page ? 0 : FFMPEG_FRAME_BATCH_SIZE;

      const resetWorkerBrowser = async () => {
        if (page) {
          await closeBatchPage(page).catch(() => {});
          page = null;
        }
        await closeReportVideoBrowser(browser).catch(() => {});
        browser = await launchReportVideoBrowser();
        framesOnCurrentPage = FFMPEG_FRAME_BATCH_SIZE;
      };

      const ensurePage = async () => {
        if (page && framesOnCurrentPage < FFMPEG_FRAME_BATCH_SIZE) return;
        if (page) {
          await closeBatchPage(page);
          page = null;
        }
        const nextBatch = await openPreparedPage(browser);
        assertStableSession(nextBatch.session, 'batches');
        page = nextBatch.page;
        framesOnCurrentPage = 0;
      };

      try {
        while (!aborted) {
          const outputFrameIndex = takeNextFrame();
          if (outputFrameIndex === null) break;

          let retries = 0;
          while (true) {
            try {
              await ensurePage();
              await renderFrameToFile(page!, outputFrameIndex);
              framesOnCurrentPage += 1;
              reportFrameRendered();
              break;
            } catch (error) {
              retries += 1;
              if (retries > FFMPEG_FRAME_MAX_RETRIES) {
                throw error;
              }
              console.log(
                `   Retrying frame ${outputFrameIndex + 1}/${outputFrameCount} (${retries}/${FFMPEG_FRAME_MAX_RETRIES}, worker ${workerIndex + 1})`,
              );
              await resetWorkerBrowser();
            }
          }
        }
      } catch (error) {
        aborted = true;
        throw error;
      } finally {
        if (page) {
          await closeBatchPage(page).catch(() => {});
        }
        await closeReportVideoBrowser(browser).catch(() => {});
      }
    };

    const initialBrowser = firstBrowser;
    const initialPage = firstBatch.page;
    firstBrowserAssignedToWorker = true;
    const workerResults = await Promise.allSettled(
      Array.from({ length: concurrency }, (_, workerIndex) =>
        runWorker(
          workerIndex,
          workerIndex === 0
            ? { browser: initialBrowser, page: initialPage }
            : undefined,
        ),
      ),
    );
    const failedWorker = workerResults.find(
      (result): result is PromiseRejectedResult => result.status === 'rejected',
    );
    if (failedWorker) {
      throw failedWorker.reason;
    }

    console.log(`   Encoding ${format.toUpperCase()} with ffmpeg…`);
    const ffmpegProcess = spawn(
      ffmpegPath,
      ffmpegArgs(targetFps, format, framePattern, outputPath, opts.scale ?? 1),
      {
        stdio: ['ignore', 'ignore', 'pipe'],
      },
    );
    let stderr = '';
    ffmpegProcess.stderr.setEncoding('utf8');
    ffmpegProcess.stderr.on('data', (chunk) => {
      stderr = `${stderr}${chunk}`.slice(-4000);
    });

    const [code, signal] = (await once(ffmpegProcess, 'close')) as [
      number | null,
      NodeJS.Signals | null,
    ];
    if (code !== 0) {
      throw new Error(
        `report-video: ffmpeg exited with ${code ?? signal ?? 'unknown status'}${stderr ? `\n${stderr}` : ''}`,
      );
    }
  } finally {
    if (!firstBrowserAssignedToWorker) {
      if (firstBatch) {
        await closeBatchPage(firstBatch.page).catch(() => {});
      }
      if (firstBrowser) {
        await closeReportVideoBrowser(firstBrowser).catch(() => {});
      }
    }
    if (frameDir) {
      rmSync(frameDir, { recursive: true, force: true });
    }
  }
}

export async function runReportVideo(
  opts: ReportVideoOptions,
): Promise<string> {
  const htmlPath = resolveReportHtmlFile(opts.input);
  const encoder = opts.encoder ?? 'ffmpeg';
  const format = resolveVideoFormat(opts.name, opts.format);
  if (encoder === 'media-recorder' && format !== 'webm') {
    throw new Error(
      'report-video: --encoder media-recorder only supports webm',
    );
  }
  const outputDir = opts.output
    ? path.resolve(opts.output)
    : getMidsceneRunSubDir('report');
  mkdirSync(outputDir, { recursive: true });
  const outputPath = resolveVideoOutputPath(outputDir, opts.name, format);
  const target = await prepareReportVideoTarget(htmlPath);

  console.log(`   Report: ${htmlPath}`);

  try {
    console.log(`   Rendering video with ${encoder}…`);
    if (encoder === 'ffmpeg') {
      await renderWithFfmpeg(target, opts, outputPath, format);
      const bytes = statSync(outputPath).size;
      console.log(
        `   ✅ Video saved: ${outputPath} (${(bytes / 1024).toFixed(1)} KB)`,
      );
      return outputPath;
    }

    console.log('   Launching headless browser…');
    const browser = await launchReportVideoBrowser(MEDIA_RECORDER_TIMEOUT_MS);
    const page = await browser.newPage();
    try {
      page.on('console', (msg) => debug('[page] %s', msg.text()));
      page.on('pageerror', (err) => debug('[pageerror] %s', err.message));

      await page.goto(target.url, {
        waitUntil: isDirectoryModeReportHtml(htmlPath)
          ? 'domcontentloaded'
          : 'networkidle0',
      });
      await waitForReportVideoHooks(page, encoder);

      const buffer = await renderWithMediaRecorder(page, opts);
      writeFileSync(outputPath, buffer);
      console.log(
        `   ✅ Video saved: ${outputPath} (${(buffer.length / 1024).toFixed(1)} KB)`,
      );
      return outputPath;
    } finally {
      await closeReportVideoBrowser(browser);
    }
  } finally {
    await target.close();
  }
}

export async function reportVideoCommand(argv: string[]): Promise<number> {
  const result = parseReportVideoArgResult(argv);
  if (result.type !== 'ok') {
    printReportVideoHelp();
    return result.exitCode;
  }
  await runReportVideo(result.options);
  return 0;
}
