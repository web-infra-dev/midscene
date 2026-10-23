// 内存说明：当前导出方式内存开销较大，尤其是 4K / 60 FPS。
// 单张 4K RGBA 原始帧约 32 MiB，浏览器渲染与 FFmpeg / x264 的并行编码、
// 前瞻帧缓冲还会占用额外内存；此前导出时 FFmpeg 常驻内存约为 3.3 GB。
// 帧通过带背压的管道逐张写入，不会将整段视频的全部帧保存在内存中。
// 暂时保留当前实现；后续若内存成为问题，再评估限制编码线程数、前瞻帧数量，
// 并避免同时运行截图测试与导出，以导出速度换取更低的内存占用。
const { spawn, spawnSync } = require('node:child_process');
const { mkdir, rename, writeFile } = require('node:fs/promises');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { parseArgs } = require('node:util');
const { chromium } = require(
  require.resolve('playwright', {
    paths: [path.resolve(__dirname, '../../packages/web-integration')],
  }),
);

async function main() {
  const { values } = parseArgs({
    options: {
      fps: { type: 'string', default: '30' },
      resolution: { type: 'string', default: '1080p' },
      lang: { type: 'string', default: 'zh' },
      output: { type: 'string' },
    },
  });
  const fps = Number(values.fps);
  if (!Number.isInteger(fps) || fps < 1 || fps > 60) {
    throw new Error('--fps must be an integer between 1 and 60');
  }
  if (!['1080p', '4k'].includes(values.resolution)) {
    throw new Error('--resolution must be 1080p or 4k');
  }
  if (!['zh', 'en'].includes(values.lang)) {
    throw new Error('--lang must be zh or en');
  }
  if (spawnSync('ffmpeg', ['-version']).status !== 0) {
    throw new Error('Install FFmpeg and make it available on PATH');
  }
  const output = path.resolve(
    values.output ??
      path.join(
        __dirname,
        '../../midscene_run/promo-export',
        `midscene-v1.17.0-highlights-${values.lang}-${values.resolution}-${fps}fps.mp4`,
      ),
  );
  const partial = `${output}.partial.mp4`;
  await mkdir(path.dirname(output), { recursive: true });
  const browser = await chromium.launch();
  const encoder = { process: undefined };
  try {
    const page = await browser.newPage({
      viewport: { width: 1920, height: 1080 },
      // Render at native device resolution; do not upscale the encoded video.
      deviceScaleFactor: values.resolution === '4k' ? 2 : 1,
    });
    const screenshotSession = await page.context().newCDPSession(page);
    const pageErrors = [];
    page.on('pageerror', (error) => pageErrors.push(error));
    const url = pathToFileURL(path.join(__dirname, 'index.html'));
    url.search = new URLSearchParams({
      export: '1',
      lang: values.lang,
    }).toString();
    await page.goto(url.href);
    await page.evaluate(async () => {
      await document.fonts.ready;
      await Promise.all([...document.images].map((image) => image.decode()));
    });
    const duration = await page.evaluate(() => window.__promoExport.duration);
    const frameCount = Math.ceil((duration * fps) / 1000);
    const ffmpeg = spawn(
      'ffmpeg',
      [
        '-hide_banner',
        '-loglevel',
        'error',
        '-y',
        '-f',
        'image2pipe',
        '-framerate',
        String(fps),
        '-c:v',
        'png',
        '-i',
        'pipe:0',
        '-an',
        '-c:v',
        'libx264',
        '-preset',
        'medium',
        '-crf',
        '16',
        '-pix_fmt',
        'yuv420p',
        '-movflags',
        '+faststart',
        partial,
      ],
      { stdio: ['pipe', 'ignore', 'pipe'] },
    );
    encoder.process = ffmpeg;
    const errors = [];
    ffmpeg.stderr.on('data', (chunk) => errors.push(chunk.toString()));
    // Errors are surfaced by the write callback and completion promise below.
    ffmpeg.stdin.on('error', () => {});
    const completed = new Promise((resolve, reject) => {
      ffmpeg.once('error', reject);
      ffmpeg.once('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`FFmpeg failed (${code}): ${errors.join('')}`));
        }
      });
    });
    completed.catch(() => {});
    const sampleFrames = new Set([
      0,
      Math.floor(frameCount / 2),
      frameCount - 1,
    ]);
    const previous = { png: undefined, revision: -1, animations: 0 };
    for (let frame = 0; frame < frameCount; frame++) {
      const rendered = await page.evaluate(
        (ms) => window.__promoExport.renderFrame(ms),
        (frame * 1000) / fps,
      );
      if (pageErrors.length) {
        throw pageErrors[0];
      }
      // Reuse a frame only if no action or CSS animation has changed the image.
      const png =
        previous.png &&
        previous.revision === rendered.revision &&
        previous.animations === 0 &&
        rendered.animations === 0
          ? previous.png
          : Buffer.from(
              (
                await screenshotSession.send('Page.captureScreenshot', {
                  format: 'png',
                  optimizeForSpeed: true,
                  clip: {
                    x: 0,
                    y: 0,
                    width: 1920,
                    height: 1080,
                    scale: values.resolution === '4k' ? 2 : 1,
                  },
                })
              ).data,
              'base64',
            );
      Object.assign(previous, {
        png,
        revision: rendered.revision,
        animations: rendered.animations,
      });
      if (sampleFrames.has(frame)) {
        await writeFile(`${output}.frame-${frame}.png`, png);
      }
      await new Promise((resolve, reject) => {
        ffmpeg.stdin.write(png, (error) => (error ? reject(error) : resolve()));
      });
      if (frame % (fps * 5) === 0) {
        console.log(
          `${frame}/${frameCount} frames (${((frame * 100) / frameCount).toFixed(1)}%)`,
        );
      }
    }
    ffmpeg.stdin.end();
    await completed;
    await rename(partial, output);
    console.log(
      `Exported ${frameCount} frames, ${duration / 1000}s, ${fps} fps: ${output}`,
    );
  } finally {
    encoder.process?.kill();
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
