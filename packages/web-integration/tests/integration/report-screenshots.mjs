import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { dirname, join, resolve } from 'node:path';
import { parseDumpScript, parseImageScripts } from '@midscene/core';
import { PlaywrightAgent } from '@midscene/web/playwright';
import { chromium } from 'playwright';

// Exercise the real capture, action, persistence and viewer paths without an
// external model. The model stub returns a known coordinate on this fixture.
const fixture = `<!doctype html><html><head><style>
html, body { margin: 0; width: 100%; height: 100%; }
body { background: linear-gradient(120deg, #207bd1, #e36ac6, #30bc96);
  background-size: 300% 300%; animation: gradient 2s infinite alternate; }
@keyframes gradient { to { background-position: 100% 100%; } }
form { position: absolute; left: 1100px; top: 240px; padding: 40px;
  width: 300px; background: white; border-radius: 20px; }
input, button { box-sizing: border-box; display: block; width: 300px;
  height: 48px; margin: 16px 0; font-size: 20px; }
</style></head><body><form onsubmit="event.preventDefault()">
<h1>Login</h1><input id="account" aria-label="Account" />
<input type="password" aria-label="Password" /><button>Login</button>
</form></body></html>`;
const artifactDir = resolve(
  process.env.SCREENSHOT_ARTIFACT_DIR || 'midscene_run/screenshot-regression',
);
await mkdir(artifactDir, { recursive: true });
let inferenceImages = [];
const server = createServer(async (req, res) => {
  try {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = JSON.parse(Buffer.concat(chunks).toString());
    for (const message of body.messages) {
      if (!Array.isArray(message.content)) continue;
      for (const part of message.content) {
        if (part.type === 'image_url') inferenceImages.push(part.image_url.url);
      }
    }
    res.setHeader('Content-Type', 'application/json');
    res.end(
      JSON.stringify({
        id: 'screenshot-regression',
        object: 'chat.completion',
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: JSON.stringify(body.messages).includes(
                'StatementIsTruthy',
              )
                ? '<observation>Deterministic screenshot plumbing fixture</observation><data-json>{"StatementIsTruthy":true}</data-json>'
                : JSON.stringify({ bbox: [1140, 340, 1440, 388], errors: [] }),
            },
            finish_reason: 'stop',
          },
        ],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      }),
    );
  } catch (error) {
    res.writeHead(500).end(String(error));
  }
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const results = [];
try {
  for (const disableGpu of [false, true]) {
    const browser = await chromium.launch({
      headless: true,
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
      args: ['--no-sandbox', ...(disableGpu ? ['--disable-gpu'] : [])],
    });
    try {
      for (const outputFormat of ['single-html', 'html-and-external-assets']) {
        const name = `${outputFormat}-${disableGpu ? 'disable-gpu' : 'default'}`;
        const page = await browser.newPage({
          viewport: { width: 1600, height: 900 },
        });
        await page.setContent(fixture);
        const inputBox = await page.locator('#account').boundingBox();
        // Keep the target under the stub's fixed center even if fonts differ.
        await page.locator('#account').evaluate((input) => {
          input.style.position = 'fixed';
          input.style.left = '1140px';
          input.style.top = '324px';
        });
        assert(inputBox);
        inferenceImages = [];
        const agent = new PlaywrightAgent(page, {
          outputFormat,
          reportFileName: name,
          modelConfig: {
            MIDSCENE_MODEL_NAME: 'screenshot-regression',
            MIDSCENE_MODEL_FAMILY: 'qwen2.5-vl',
            MIDSCENE_MODEL_API_KEY: 'local-stub',
            MIDSCENE_MODEL_BASE_URL: `http://127.0.0.1:${server.address().port}/v1`,
          },
        });
        try {
          await agent.aiTap('Account input');
          await page.keyboard.type('test');
          assert.equal(await page.locator('#account').inputValue(), 'test');
          await agent.aiAssert('The login form is visible');
        } finally {
          await agent.destroy();
        }
        assert(agent.reportFile, 'The agent must generate an HTML report');
        const html = await readFile(agent.reportFile, 'utf8');
        const dump = JSON.parse(parseDumpScript(html));
        const inlineImages = Object.values(parseImageScripts(html));
        const externalPaths = new Set();
        const visit = (value) => {
          if (!value || typeof value !== 'object') return;
          if (
            value.type === 'midscene_screenshot_ref' &&
            value.storage === 'file'
          )
            externalPaths.add(value.path);
          for (const child of Object.values(value)) visit(child);
        };
        visit(dump);
        const reportImages = [...inlineImages];
        for (const path of externalPaths) {
          reportImages.push(
            `data:image/jpeg;base64,${(await readFile(join(dirname(agent.reportFile), path))).toString('base64')}`,
          );
        }
        assert(
          inferenceImages.length > 0,
          'The model must receive screenshots',
        );
        assert(reportImages.length > 0, 'The report must contain screenshots');
        if (outputFormat === 'html-and-external-assets')
          assert(externalPaths.size > 0, 'External assets must exist');
        const metrics = [];
        for (const [kind, images] of [
          ['inference', inferenceImages],
          ['report', reportImages],
        ]) {
          for (const [index, src] of images.entries()) {
            await writeFile(
              join(artifactDir, `${name}-${kind}-${index}.jpeg`),
              Buffer.from(src.split(',')[1], 'base64'),
            );
            const metric = await page.evaluate(async (src) => {
              const image = new Image();
              image.src = src;
              await image.decode();
              const canvas = document.createElement('canvas');
              canvas.width = 160;
              canvas.height = 90;
              const ctx = canvas.getContext('2d');
              ctx.drawImage(image, 0, 0, 160, 90);
              const pixels = ctx.getImageData(0, 0, 160, 90).data;
              let colored = 0;
              for (let i = 0; i < pixels.length; i += 4) {
                if (Math.max(pixels[i], pixels[i + 1], pixels[i + 2]) > 40)
                  colored++;
              }
              return {
                width: image.naturalWidth,
                height: image.naturalHeight,
                nonBlackRatio: colored / (160 * 90),
              };
            }, src);
            metrics.push({ kind, index, ...metric });
            if (kind === 'report') {
              assert.equal(metric.width, 1600);
              assert.equal(metric.height, 900);
            }
            assert(
              metric.nonBlackRatio > 0.95,
              `${name} ${kind} ${index} is black: ${JSON.stringify(metric)}`,
            );
          }
        }
        results.push({
          name,
          browser: browser.version(),
          reportFile: agent.reportFile,
          metrics,
        });
        console.log(JSON.stringify(results.at(-1)));
        await page.close();
      }
    } finally {
      await browser.close();
    }
  }
} finally {
  await writeFile(
    join(artifactDir, 'results.json'),
    JSON.stringify(results, null, 2),
  );
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
}
