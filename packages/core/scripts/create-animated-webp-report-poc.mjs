#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
/**
 * Generate an experimental self-contained report that replaces inline PNG
 * screenshots with one q90 animated WebP plus a screenshot-id/frame manifest.
 *
 * Usage:
 *   node packages/core/scripts/create-animated-webp-report-poc.mjs input.html output.html
 */
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const [inputArg, outputArg] = process.argv.slice(2);
if (!inputArg || !outputArg) {
  throw new Error(
    'Usage: create-animated-webp-report-poc.mjs input.html output.html',
  );
}

const inputPath = resolve(inputArg);
const outputPath = resolve(outputArg);
const reportHtml = await readFile(inputPath, 'utf8');
const imagePattern =
  /<script type="midscene-image" data-id="([^"]+)">([\s\S]*?)<\/script>/g;
const images = [];
let match;
match = imagePattern.exec(reportHtml);
while (match) {
  const [, id, dataUri] = match;
  match = imagePattern.exec(reportHtml);
  if (!dataUri.startsWith('data:image/png;base64,')) {
    continue;
  }
  images.push({ id, dataUri });
}

if (images.length < 2) {
  throw new Error(
    `Expected at least two inline PNG screenshots, found ${images.length}`,
  );
}

const pngFrames = images.map(({ dataUri }) =>
  Buffer.from(dataUri.slice('data:image/png;base64,'.length), 'base64'),
);
const uniquePngFrames = [];
const frameIndexByHash = new Map();
const manifestFrames = images.map(({ id }, sourceIndex) => {
  const frame = pngFrames[sourceIndex];
  const hash = createHash('sha256').update(frame).digest('hex');
  let frameIndex = frameIndexByHash.get(hash);
  if (frameIndex === undefined) {
    frameIndex = uniquePngFrames.length;
    frameIndexByHash.set(hash, frameIndex);
    uniquePngFrames.push(frame);
  }
  return { id, frameIndex };
});
const pngDimensions = (buffer) => {
  if (buffer.toString('ascii', 1, 4) !== 'PNG') {
    throw new Error('Expected PNG screenshot');
  }
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
};
const metadata = pngDimensions(pngFrames[0]);
for (const frame of uniquePngFrames.slice(1)) {
  const dimensions = pngDimensions(frame);
  if (
    dimensions.width !== metadata.width ||
    dimensions.height !== metadata.height
  ) {
    throw new Error('POC only supports screenshots with identical dimensions');
  }
}

const tempDir = await mkdtemp(join(tmpdir(), 'midscene-animated-webp-'));
const webpPath = join(tempDir, 'screenshots.webp');

function countAnimatedWebpFrames(webp) {
  let offset = 12; // RIFF header: "RIFF" + size + "WEBP"
  let frameCount = 0;
  while (offset + 8 <= webp.length) {
    const type = webp.toString('ascii', offset, offset + 4);
    const size = webp.readUInt32LE(offset + 4);
    if (type === 'ANMF') frameCount += 1;
    offset += 8 + size + (size % 2);
  }
  return frameCount;
}

try {
  const framePaths = await Promise.all(
    uniquePngFrames.map(async (frame, index) => {
      const framePath = join(
        tempDir,
        `frame-${String(index).padStart(4, '0')}.png`,
      );
      await writeFile(framePath, frame);
      return framePath;
    }),
  );
  const args = [
    // Keep one encoded frame per screenshot: frame index is the report's
    // address, so an encoder may not coalesce or omit visually similar frames.
    '-kmax',
    '0',
    '-loop',
    '0',
    ...framePaths.flatMap((framePath) => [
      '-lossy',
      '-q',
      '90',
      '-m',
      '6',
      '-d',
      '1000',
      framePath,
    ]),
    '-o',
    webpPath,
  ];
  await new Promise((resolveCommand, rejectCommand) => {
    const process = spawn('img2webp', args);
    let stderr = '';
    process.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    process.on('error', (error) => rejectCommand(error));
    process.on('exit', (code) => {
      if (code === 0) resolveCommand();
      else {
        rejectCommand(
          new Error(`img2webp exited with code ${code}: ${stderr.trim()}`),
        );
      }
    });
  });
  const webp = await readFile(webpPath);
  const encodedFrameCount = countAnimatedWebpFrames(webp);
  if (encodedFrameCount !== uniquePngFrames.length) {
    throw new Error(
      `Animated WebP has ${encodedFrameCount} frames but manifest has ${uniquePngFrames.length}`,
    );
  }
  const sequenceId = 'animated-webp-poc-1';
  const manifest = {
    version: 1,
    sequenceId,
    frames: manifestFrames,
  };
  const attachment = [
    `<script type="midscene-animated-webp" data-id="${sequenceId}">data:image/webp;base64,${webp.toString('base64')}</script>`,
    `<script type="midscene-animated-webp-manifest">${JSON.stringify(manifest)}</script>`,
  ].join('\n');

  const convertedHtml = reportHtml.replace(imagePattern, (tag, id, dataUri) =>
    dataUri.startsWith('data:image/png;base64,') ? '' : tag,
  );
  await writeFile(outputPath, `${convertedHtml}\n${attachment}\n`);

  console.log(
    JSON.stringify(
      {
        inputPath,
        outputPath,
        frameCount: images.length,
        uniqueFrameCount: uniquePngFrames.length,
        encodedFrameCount,
        dimensions: `${metadata.width}x${metadata.height}`,
        sourcePngBytes: pngFrames.reduce(
          (total, frame) => total + frame.length,
          0,
        ),
        animatedWebpBytes: webp.length,
        reduction:
          1 -
          webp.length /
            pngFrames.reduce((total, frame) => total + frame.length, 0),
      },
      null,
      2,
    ),
  );
} finally {
  await rm(tempDir, { recursive: true, force: true });
}
