#!/usr/bin/env node

import { spawn } from 'node:child_process';
/**
 * Stream-repack a large inline Midscene report using the current report shell.
 * It avoids loading the original HTML (which can be hundreds of MiB) as one
 * JavaScript string.
 *
 * Usage:
 *   node packages/core/scripts/repack-inline-report-webp-poc.mjs static input.html output.html
 *   node packages/core/scripts/repack-inline-report-webp-poc.mjs animated input.html output.html
 */
import { createHash } from 'node:crypto';
import { once } from 'node:events';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import sharp from 'sharp';

const [mode, inputArg, outputArg] = process.argv.slice(2);
if (!['static', 'animated'].includes(mode) || !inputArg || !outputArg) {
  throw new Error(
    'Usage: repack-inline-report-webp-poc.mjs <static|animated> input.html output.html',
  );
}

const inputPath = resolve(inputArg);
const outputPath = resolve(outputArg);
const shellPath = resolve('apps/report/dist/index.html');
const shell = await readFile(shellPath, 'utf8');
const shellClosingHtml = shell.lastIndexOf('</html>');
if (shellClosingHtml < 0)
  throw new Error('Current report shell is missing </html>');

const tempDir = await mkdtemp(join(tmpdir(), 'midscene-report-webp-'));
const output = createWriteStream(outputPath);

async function write(value) {
  if (!output.write(value)) await once(output, 'drain');
}

function pngOrJpegDimensions(buffer) {
  const metadata = sharp(buffer).metadata();
  return metadata;
}

function countAnimatedWebpFrames(webp) {
  let offset = 12;
  let frameCount = 0;
  while (offset + 8 <= webp.length) {
    const type = webp.toString('ascii', offset, offset + 4);
    const size = webp.readUInt32LE(offset + 4);
    if (type === 'ANMF') frameCount += 1;
    offset += 8 + size + (size % 2);
  }
  return frameCount;
}

async function runImg2Webp(framePaths, outputFile) {
  const args = [
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
    outputFile,
  ];
  await new Promise((resolveCommand, rejectCommand) => {
    const child = spawn('img2webp', args);
    let stderr = '';
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    child.on('error', rejectCommand);
    child.on('exit', (code) => {
      if (code === 0) resolveCommand();
      else
        rejectCommand(
          new Error(`img2webp exited with code ${code}: ${stderr.trim()}`),
        );
    });
  });
}

async function thumbnail(buffer, options = {}) {
  return sharp(buffer, options)
    .resize(32, 32, { fit: 'fill' })
    .removeAlpha()
    .raw()
    .toBuffer();
}

function pixelDistance(left, right) {
  let distance = 0;
  for (let index = 0; index < left.length; index += 1) {
    const delta = left[index] - right[index];
    distance += delta * delta;
  }
  return distance;
}

const tagOpen = '<script type="midscene';
const tagClose = '</script>';
const sequences = new Map();
let sourceImageCount = 0;
let sourceImageBytes = 0;
let dumpCount = 0;
let staticImageBytes = 0;

async function processTag(tag) {
  const typeMatch = /^<script type="([^"]+)"[^>]*>([\s\S]*)<\/script>$/.exec(
    tag,
  );
  if (!typeMatch) return;
  const [, type, content] = typeMatch;
  const trimmed = content.trim();
  if (type === 'midscene_web_dump' && trimmed.startsWith('{')) {
    dumpCount += 1;
    await write(`${tag}\n`);
    return;
  }
  if (type !== 'midscene-image' || !trimmed.startsWith('data:image/')) return;

  const idMatch = /data-id="([^"]+)"/.exec(tag);
  const dataMatch = /^data:image\/[^;]+;base64,([\s\S]+)$/.exec(trimmed);
  if (!idMatch || !dataMatch) return;
  const id = idMatch[1];
  const source = Buffer.from(dataMatch[1], 'base64');
  sourceImageCount += 1;
  sourceImageBytes += source.length;

  if (mode === 'static') {
    const webp = await sharp(source)
      .webp({ quality: 90, effort: 6 })
      .toBuffer();
    staticImageBytes += webp.length;
    await write(
      `<script type="midscene-image" data-id="${id}">data:image/webp;base64,${webp.toString('base64')}</script>\n`,
    );
    return;
  }

  const metadata = await pngOrJpegDimensions(source);
  if (!metadata.width || !metadata.height) {
    throw new Error(`Unable to read dimensions for screenshot ${id}`);
  }
  const sequenceKey = `${metadata.width}x${metadata.height}`;
  let sequence = sequences.get(sequenceKey);
  if (!sequence) {
    sequence = {
      key: sequenceKey,
      width: metadata.width,
      height: metadata.height,
      frames: [],
      frameIndexByHash: new Map(),
      sourceByFrameIndex: [],
    };
    sequences.set(sequenceKey, sequence);
  }
  // img2webp coalesces visually identical frames. Deduplicate using decoded
  // pixels up front so the manifest addresses the encoded frame sequence.
  const rawPixels = await sharp(source).raw().toBuffer();
  const hash = createHash('sha256').update(rawPixels).digest('hex');
  let frameIndex = sequence.frameIndexByHash.get(hash);
  if (frameIndex === undefined) {
    frameIndex = sequence.sourceByFrameIndex.length;
    sequence.frameIndexByHash.set(hash, frameIndex);
    sequence.sourceByFrameIndex.push(source);
  }
  sequence.frames.push({ id, frameIndex });
}

async function scanAndProcess() {
  let buffer = '';
  for await (const chunk of createReadStream(inputPath, {
    encoding: 'utf8',
    highWaterMark: 1024 * 1024,
  })) {
    buffer += chunk;
    while (true) {
      const start = buffer.indexOf(tagOpen);
      if (start < 0) {
        buffer = buffer.slice(-(tagOpen.length - 1));
        break;
      }
      const end = buffer.indexOf(tagClose, start);
      if (end < 0) {
        buffer = buffer.slice(start);
        break;
      }
      const tag = buffer.slice(start, end + tagClose.length);
      buffer = buffer.slice(end + tagClose.length);
      await processTag(tag);
    }
  }
}

try {
  await write(shell.slice(0, shellClosingHtml));
  await scanAndProcess();

  let animatedWebpBytes = 0;
  if (mode === 'animated') {
    let sequenceNumber = 0;
    for (const sequence of sequences.values()) {
      const sequenceId = `animated-webp-poc-${sequenceNumber++}`;
      const framePaths = await Promise.all(
        sequence.sourceByFrameIndex.map(async (frame, index) => {
          const framePath = join(
            tempDir,
            `${sequenceId}-${String(index).padStart(4, '0')}.jpg`,
          );
          await writeFile(framePath, frame);
          return framePath;
        }),
      );
      const webpPath = join(tempDir, `${sequenceId}.webp`);
      await runImg2Webp(framePaths, webpPath);
      const webp = await readFile(webpPath);
      const encodedFrameCount = countAnimatedWebpFrames(webp);
      if (encodedFrameCount === 0) {
        throw new Error(`${sequenceId} did not encode any frames`);
      }
      // libwebp may coalesce frames whose small source differences disappear at
      // q90. Resolve every original source frame to its closest decoded frame
      // so report ids always point to a valid animation frame.
      const sourceThumbnails = await Promise.all(
        sequence.sourceByFrameIndex.map((frame) => thumbnail(frame)),
      );
      const encodedThumbnails = await Promise.all(
        Array.from({ length: encodedFrameCount }, (_, frameIndex) =>
          thumbnail(webp, { animated: true, page: frameIndex, pages: 1 }),
        ),
      );
      const encodedFrameBySource = sourceThumbnails.map((sourceThumbnail) => {
        let closestIndex = 0;
        let closestDistance = Number.POSITIVE_INFINITY;
        for (let index = 0; index < encodedThumbnails.length; index += 1) {
          const distance = pixelDistance(
            sourceThumbnail,
            encodedThumbnails[index],
          );
          if (distance < closestDistance) {
            closestIndex = index;
            closestDistance = distance;
          }
        }
        return closestIndex;
      });
      animatedWebpBytes += webp.length;
      const manifest = {
        version: 1,
        sequenceId,
        frames: sequence.frames.map((frame) => ({
          id: frame.id,
          frameIndex: encodedFrameBySource[frame.frameIndex],
        })),
      };
      await write(
        `<script type="midscene-animated-webp" data-id="${sequenceId}">data:image/webp;base64,${webp.toString('base64')}</script>\n`,
      );
      await write(
        `<script type="midscene-animated-webp-manifest">${JSON.stringify(manifest)}</script>\n`,
      );
    }
  }

  await write(shell.slice(shellClosingHtml));
  output.end();
  await once(output, 'finish');
  console.log(
    JSON.stringify(
      {
        mode,
        inputPath,
        outputPath,
        dumpCount,
        sourceImageCount,
        sourceImageBytes,
        staticImageBytes: mode === 'static' ? staticImageBytes : undefined,
        animatedWebpBytes: mode === 'animated' ? animatedWebpBytes : undefined,
        sequences:
          mode === 'animated'
            ? Array.from(sequences.values()).map(
                ({ key, frames, sourceByFrameIndex }) => ({
                  key,
                  screenshotIds: frames.length,
                  uniqueSourceFrames: sourceByFrameIndex.length,
                }),
              )
            : undefined,
      },
      null,
      2,
    ),
  );
} finally {
  await rm(tempDir, { recursive: true, force: true });
}
