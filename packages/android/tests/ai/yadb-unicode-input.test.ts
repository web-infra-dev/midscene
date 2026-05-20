import http from 'node:http';
import { sleep } from '@midscene/core/utils';
import type ADB from 'appium-adb';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { AndroidDevice, getConnectedDevices } from '../../src';

vi.setConfig({
  testTimeout: 180_000,
});

const INPUT_CASES = [
  { name: 'ASCII inputText path', value: 'hello-midscene' },
  { name: 'Chinese yadb path', value: '测速' },
];

describe('Android yadb unicode input', () => {
  let device: AndroidDevice;
  let adb: ADB;
  let server: http.Server;
  let port: number;
  let latestValue = '';

  beforeAll(async () => {
    server = http.createServer((req, res) => {
      if (req.url === '/value' && req.method === 'POST') {
        let body = '';
        req.setEncoding('utf8');
        req.on('data', (chunk) => {
          body += chunk;
        });
        req.on('end', () => {
          latestValue = JSON.parse(body).value;
          res.writeHead(204).end();
        });
        return;
      }

      latestValue = '';
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end(`<!doctype html>
<html>
  <head>
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Midscene Android Input Smoke</title>
    <style>
      html, body { margin: 0; width: 100%; height: 100%; }
      body { display: flex; align-items: center; justify-content: center; }
      textarea {
        width: 82vw;
        height: 42vh;
        font: 28px sans-serif;
        padding: 24px;
      }
    </style>
  </head>
  <body>
    <textarea id="target" autofocus autocapitalize="off" autocomplete="off" spellcheck="false"></textarea>
    <script>
      const target = document.getElementById('target');
      const send = () => fetch('/value', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ value: target.value }),
      });
      target.addEventListener('input', send);
      window.addEventListener('load', () => target.focus());
    </script>
  </body>
</html>`);
    });

    await new Promise<void>((resolve) =>
      server.listen(0, '127.0.0.1', resolve),
    );
    const address = server.address();
    if (!address || typeof address === 'string') {
      throw new Error('Failed to start input smoke server');
    }
    port = address.port;

    const devices = await getConnectedDevices();
    if (!devices[0]) {
      throw new Error('No connected Android device found');
    }

    device = new AndroidDevice(devices[0].udid, {
      autoDismissKeyboard: true,
      imeStrategy: 'yadb-for-non-ascii',
      scrcpyConfig: { enabled: false },
    });
    adb = await device.getAdb();
    await adb.reversePort(port, port);
  });

  afterAll(async () => {
    if (adb && port) {
      await adb.adbExec(['reverse', '--remove', `tcp:${port}`]).catch(() => {});
    }
    await device?.destroy();
    await new Promise<void>((resolve) => server?.close(() => resolve()));
  });

  for (const [index, inputCase] of INPUT_CASES.entries()) {
    it(`types ${inputCase.name}`, async () => {
      latestValue = '';
      await device.launch(`http://127.0.0.1:${port}/?case=${index}`);
      await sleep(3000);

      const size = await device.size();
      await device.inputPrimitives.pointer.tap({
        x: Math.round(size.width / 2),
        y: Math.round(size.height / 2),
      });
      await sleep(500);

      latestValue = '';
      await device.inputPrimitives.keyboard.typeText(inputCase.value);

      await waitForValue(() => latestValue, inputCase.value);
      expect(latestValue).toBe(inputCase.value);
    });
  }
});

async function waitForValue(
  getValue: () => string,
  expected: string,
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < 10_000) {
    if (getValue() === expected) {
      return;
    }
    await sleep(200);
  }
  throw new Error(
    `Timed out waiting for input value ${JSON.stringify(expected)}, got ${JSON.stringify(getValue())}`,
  );
}
