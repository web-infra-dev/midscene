import { readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { inflateSync } from 'node:zlib';
import {
  MIDSCENE_MODEL_API_KEY,
  MIDSCENE_MODEL_BASE_URL,
  MIDSCENE_MODEL_FAMILY,
  MIDSCENE_MODEL_NAME,
  MIDSCENE_MODEL_RETRY_COUNT,
  MIDSCENE_MODEL_TIMEOUT,
} from '@midscene/shared/env';
import { describe, expect, it } from '@rstest/core';
import { ComputerAgent, RDPDevice } from '../../../src';

const RUN_XRDP_CI_E2E = process.env.MIDSCENE_XRDP_CI_E2E === '1';
const REPORT_FILE_NAME = 'rdp-xrdp-ci-e2e';
const PNG_DATA_URL_PREFIX = 'data:image/png;base64,';
const DESKTOP_WIDTH = 1280;
const DESKTOP_HEIGHT = 720;

function sleep(timeMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, timeMs));
}

function locateAt(x: number, y: number, prompt: string) {
  return {
    prompt,
    locatedPixelResult: { center: [x, y] as [number, number] },
  };
}

function decodeRgba(dataUrl: string) {
  if (!dataUrl.startsWith(PNG_DATA_URL_PREFIX)) {
    throw new Error('RDP screenshot is not a PNG data URL');
  }

  const png = Buffer.from(dataUrl.slice(PNG_DATA_URL_PREFIX.length), 'base64');
  expect(png.subarray(0, 8)).toEqual(
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  );

  let offset = 8;
  let width = 0;
  let height = 0;
  const compressedChunks: Buffer[] = [];
  while (offset < png.length) {
    const length = png.readUInt32BE(offset);
    const type = png.toString('ascii', offset + 4, offset + 8);
    const chunk = png.subarray(offset + 8, offset + 8 + length);
    offset += 12 + length;
    if (type === 'IHDR') {
      width = chunk.readUInt32BE(0);
      height = chunk.readUInt32BE(4);
    } else if (type === 'IDAT') {
      compressedChunks.push(chunk);
    } else if (type === 'IEND') {
      break;
    }
  }

  if (!width || !height) {
    throw new Error('RDP screenshot PNG is missing dimensions');
  }

  const rows = inflateSync(Buffer.concat(compressedChunks));
  const rowSize = width * 4 + 1;
  if (
    rows.length !== rowSize * height ||
    Array.from({ length: height }, (_, y) => rows[y * rowSize]).some(Boolean)
  ) {
    throw new Error('RDP screenshot PNG uses an unexpected pixel layout');
  }

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (rows[y * rowSize + 1 + x * 4 + 3] !== 0xff) {
        throw new Error('RDP screenshot contains a transparent desktop pixel');
      }
    }
  }

  return {
    width,
    height,
    rgba: Buffer.concat(
      Array.from({ length: height }, (_, y) =>
        rows.subarray(y * rowSize + 1, (y + 1) * rowSize),
      ),
    ),
  };
}

function nonBlackRatio(rgba: Buffer): number {
  let nonBlackPixels = 0;
  for (let offset = 0; offset < rgba.length; offset += 4) {
    if (rgba[offset] || rgba[offset + 1] || rgba[offset + 2]) {
      nonBlackPixels++;
    }
  }
  return nonBlackPixels / (rgba.length / 4);
}

function createDevice(password = process.env.MIDSCENE_XRDP_PASSWORD) {
  const username = process.env.MIDSCENE_XRDP_USERNAME;
  if (!username || !password) {
    throw new Error(
      'MIDSCENE_XRDP_USERNAME and MIDSCENE_XRDP_PASSWORD are required',
    );
  }

  return new RDPDevice({
    host: '127.0.0.1',
    port: Number(process.env.MIDSCENE_XRDP_PORT || '3389'),
    username,
    password,
    ignoreCertificate: true,
    desktopWidth: DESKTOP_WIDTH,
    desktopHeight: DESKTOP_HEIGHT,
  });
}

async function recordChangedFrame(
  agent: ComputerAgent<RDPDevice>,
  device: RDPDevice,
  previousRgba: Buffer,
  title: string,
  content: string,
): Promise<Buffer> {
  await sleep(300);
  const screenshot = await device.screenshotBase64();
  const current = decodeRgba(screenshot);
  expect(current.rgba).not.toEqual(previousRgba);
  await agent.recordToReport(title, {
    screenshotBase64: screenshot,
    content,
  });
  return current.rgba;
}

describe.skipIf(!RUN_XRDP_CI_E2E)('RDP against a local xrdp desktop', () => {
  it('surfaces rejected xrdp credentials', async () => {
    const device = createDevice('intentionally-wrong-password');
    try {
      await expect(device.connect()).rejects.toThrow();
    } finally {
      await device.destroy();
    }
  });

  it('covers RDP actions and generates a Midscene report', async () => {
    const runDir = path.resolve(process.env.MIDSCENE_RUN_DIR || 'midscene_run');
    const reportFile = path.join(runDir, 'report', `${REPORT_FILE_NAME}.html`);
    await rm(reportFile, { force: true });

    const device = createDevice();
    let agent: ComputerAgent<RDPDevice> | undefined;

    try {
      await device.connect();
      agent = new ComputerAgent(device, {
        modelConfig: {
          [MIDSCENE_MODEL_NAME]: 'rdp-ci-model-must-not-run',
          [MIDSCENE_MODEL_API_KEY]: 'rdp-ci-unused-key',
          [MIDSCENE_MODEL_BASE_URL]: 'http://127.0.0.1:1/v1',
          [MIDSCENE_MODEL_FAMILY]: 'qwen3-vl',
          [MIDSCENE_MODEL_TIMEOUT]: '1000',
          [MIDSCENE_MODEL_RETRY_COUNT]: '0',
        },
        groupName: 'RDP xrdp CI E2E',
        groupDescription:
          'Deterministic RDP screenshot and input validation against a local xrdp server',
        generateReport: true,
        autoPrintReportMsg: false,
        reportFileName: REPORT_FILE_NAME,
        waitAfterAction: 200,
      });

      expect(await device.size()).toEqual({
        width: DESKTOP_WIDTH,
        height: DESKTOP_HEIGHT,
      });
      await expect(
        agent.callActionInActionSpace('ListDisplays'),
      ).resolves.toEqual([
        expect.objectContaining({
          name: expect.stringContaining(`${DESKTOP_WIDTH}x${DESKTOP_HEIGHT}`),
          primary: true,
        }),
      ]);
      const firstScreenshot = await device.screenshotBase64();
      const first = decodeRgba(firstScreenshot);
      expect({ width: first.width, height: first.height }).toEqual({
        width: DESKTOP_WIDTH,
        height: DESKTOP_HEIGHT,
      });
      expect(nonBlackRatio(first.rgba)).toBeGreaterThan(0.15);
      await agent.recordToReport('Initial xrdp desktop', {
        screenshotBase64: firstScreenshot,
        content: 'The first complete framebuffer received after RDP login.',
      });

      await agent.callActionInActionSpace('Input', {
        value: 'midscene-rdp-ci',
        mode: 'replace',
        locate: locateAt(640, 165, 'the text field in the xrdp fixture'),
      });
      await sleep(500);
      const screenshotStartedAt = performance.now();
      const secondScreenshot = await device.screenshotBase64();
      const screenshotElapsedMs = performance.now() - screenshotStartedAt;
      const second = decodeRgba(secondScreenshot);
      expect(second.rgba).not.toEqual(first.rgba);
      expect(screenshotElapsedMs).toBeLessThan(2_000);
      await agent.recordToReport('Updated xrdp desktop', {
        screenshotBase64: secondScreenshot,
        content: `The remote text field changed; screenshot completed in ${screenshotElapsedMs.toFixed(1)}ms.`,
      });

      await agent.callActionInActionSpace('KeyboardPress', {
        keyName: 'Enter',
        locate: locateAt(640, 165, 'the text field in the xrdp fixture'),
      });
      let previousRgba = await recordChangedFrame(
        agent,
        device,
        second.rgba,
        'Keyboard input over RDP',
        'The fixture received the Enter key through the RDP protocol.',
      );

      await agent.callActionInActionSpace('Hover', {
        locate: locateAt(180, 340, 'the green hover target'),
      });
      previousRgba = await recordChangedFrame(
        agent,
        device,
        previousRgba,
        'Pointer hover over RDP',
        'The remote hover target received pointer movement without a click.',
      );

      await agent.callActionInActionSpace('DoubleClick', {
        locate: locateAt(460, 340, 'the orange double-click target'),
      });
      previousRgba = await recordChangedFrame(
        agent,
        device,
        previousRgba,
        'Double click over RDP',
        'The remote target received a double-click event.',
      );

      await agent.callActionInActionSpace('RightClick', {
        locate: locateAt(740, 340, 'the purple right-click target'),
      });
      previousRgba = await recordChangedFrame(
        agent,
        device,
        previousRgba,
        'Right click over RDP',
        'The remote target received a right-click event.',
      );

      await agent.callActionInActionSpace('Scroll', {
        scrollType: 'singleAction',
        direction: 'down',
        distance: 240,
        locate: locateAt(460, 475, 'the blue scroll target'),
      });
      previousRgba = await recordChangedFrame(
        agent,
        device,
        previousRgba,
        'Wheel input over RDP',
        'The remote target received wheel input.',
      );

      await agent.callActionInActionSpace('DragAndDrop', {
        from: locateAt(1020, 320, 'the cyan drag source'),
        to: locateAt(1020, 440, 'the red drop target'),
      });
      previousRgba = await recordChangedFrame(
        agent,
        device,
        previousRgba,
        'Drag and drop over RDP',
        'The pointer remained pressed from the remote drag source to the drop target.',
      );

      await agent.callActionInActionSpace('Tap', {
        locate: locateAt(640, 625, 'the valid black framebuffer button'),
      });
      await sleep(500);
      const blackScreenshot = await device.screenshotBase64();
      const black = decodeRgba(blackScreenshot);
      const blackRatio = nonBlackRatio(black.rgba);
      expect(black.rgba).not.toEqual(previousRgba);
      await agent.recordToReport('Valid black framebuffer', {
        screenshotBase64: blackScreenshot,
        content: `The server intentionally rendered a valid black framebuffer (${(
          blackRatio * 100
        ).toFixed(2)}% non-black pixels).`,
      });
      expect(blackRatio).toBeLessThan(0.01);

      await agent.callActionInActionSpace('KeyboardPress', {
        keyName: 'Escape',
      });
      const finalRgba = await recordChangedFrame(
        agent,
        device,
        black.rgba,
        'RDP E2E coverage complete',
        'Passed authentication, display enumeration, screenshot updates, Input, KeyboardPress, Hover, DoubleClick, RightClick, Scroll, DragAndDrop, Tap, and valid black framebuffer checks.',
      );
      expect(nonBlackRatio(finalRgba)).toBeGreaterThan(0.15);
      expect(agent.metrics.calls).toBe(0);

      await agent.destroy();
      expect(agent.reportFile).toBe(reportFile);
      const reportHtml = await readFile(reportFile, 'utf8');
      expect(reportHtml).toContain('<script type="midscene_web_dump"');
      expect(reportHtml).not.toContain('REPLACE_ME_WITH_REPORT_HTML');
      for (const reportEntry of [
        'Initial xrdp desktop',
        'Updated xrdp desktop',
        'Keyboard input over RDP',
        'Pointer hover over RDP',
        'Double click over RDP',
        'Right click over RDP',
        'Wheel input over RDP',
        'Drag and drop over RDP',
        'Valid black framebuffer',
        'RDP E2E coverage complete',
      ]) {
        expect(reportHtml).toContain(reportEntry);
      }
    } finally {
      if (agent) {
        await agent.destroy();
      } else {
        await device.destroy();
      }
    }
  });
});
