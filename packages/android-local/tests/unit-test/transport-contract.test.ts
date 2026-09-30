/**
 * Runs the shared transport contract (see `transport-contract.ts`) against every
 * backend that ships today, so a new backend cannot silently drift.
 */
import fs from 'node:fs';
import path from 'node:path';

import { AdbShellTransport } from '../../src/transport/adb-shell';
import {
  type FakeCommandResponse,
  FakeCommandRunner,
} from '../../src/transport/command-runner';
import type { ShellFileIo } from '../../src/transport/shell';
import { ShellTransport } from '../../src/transport/shell';
import { describeTransportContract } from './transport-contract';

const fixtureDir = path.join(__dirname, 'fixtures');
const dumpsysDisplay = fs.readFileSync(
  path.join(fixtureDir, 'dumpsys-display.txt'),
  'utf8',
);
const wmSize = fs.readFileSync(path.join(fixtureDir, 'wm-size.txt'), 'utf8');
const wmDensity = fs.readFileSync(
  path.join(fixtureDir, 'wm-density.txt'),
  'utf8',
);

const FILE_CHANNEL_DIR = '/storage/emulated/0/Android/data/app/files/channel';
const SERIAL = 'emulator-5554';

/**
 * The shell transport reads payloads through the on-device file channel, so the
 * contract's `screencap` response is surfaced as the file content, not stdout.
 */
function fileIoFromResponses(responses: FakeCommandResponse[]): ShellFileIo {
  const findImage = (): Buffer => {
    const response = responses.find(
      (candidate) =>
        Array.isArray(candidate.match) && candidate.match.includes('screencap'),
    );
    const stdout = response?.stdout ?? '';
    return Buffer.isBuffer(stdout)
      ? stdout
      : Buffer.from(stdout || 'no screenshot payload was scripted', 'utf8');
  };

  return {
    async read(filePath: string) {
      return filePath.endsWith('.txt')
        ? Buffer.from(dumpsysDisplay, 'utf8')
        : findImage();
    },
  };
}

describeTransportContract({
  name: 'ShellTransport',
  healthy: () => [
    { match: ['id -u'], stdout: '2000\n' },
    { match: ['command -v'], stdout: '/system/bin/command\n' },
    { match: ['dumpsys display'], stdout: dumpsysDisplay },
    { match: ['wm size'], stdout: wmSize },
    { match: ['wm density'], stdout: wmDensity },
    { match: ['mkdir -p'], stdout: '' },
    { match: ['rm -f'], stdout: '' },
    { match: ['input'], stdout: '' },
  ],
  create: (responses) =>
    new ShellTransport({
      runner: new FakeCommandRunner(responses),
      fileChannelDir: FILE_CHANNEL_DIR,
      displayCacheTtlMs: 0,
      fileIo: fileIoFromResponses(responses),
    }),
});

describeTransportContract({
  name: 'AdbShellTransport',
  healthy: () => [
    { match: ['id -u'], stdout: '2000\n' },
    { match: ['command -v'], stdout: '/system/bin/command\n' },
    { match: ['dumpsys display'], stdout: dumpsysDisplay },
    { match: ['wm size'], stdout: wmSize },
    { match: ['wm density'], stdout: wmDensity },
    { match: ['input'], stdout: '' },
  ],
  create: (responses) =>
    new AdbShellTransport({
      adbPath: 'adb',
      serial: SERIAL,
      runner: new FakeCommandRunner(responses),
      displayCacheTtlMs: 0,
    }),
});
