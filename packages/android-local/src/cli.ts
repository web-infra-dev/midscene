#!/usr/bin/env node
/**
 * `midscene-local` — the deployment shell around the on-device agent.
 *
 * It runs inside the Android host app's embedded Node (the app injects the
 * bridge coordinates), or on a PC against adb. The surface is deliberately
 * small: inspect the device (`doctor`) and run a config (`run`).
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import { loadLocalAgentConfig } from './config/schema';
import { runLocalAgentConfigFile } from './runner/run';
import { AdbShellTransport } from './transport/adb-shell';
import {
  ExecBridgeCommandRunner,
  bridgeFromEnv,
  createBridgeFileIo,
} from './transport/bridge';
import { ShellTransport } from './transport/shell';
import type { AndroidTransport } from './transport/types';

function readVersion(): string {
  // The CLI is bundled into dist/lib (cjs) and dist/es (esm), so the package
  // manifest sits either one or two levels up depending on the artefact.
  for (const candidate of ['../../package.json', '../package.json']) {
    try {
      const pkg = JSON.parse(
        fs.readFileSync(path.resolve(__dirname, candidate), 'utf8'),
      ) as { version?: string };
      if (pkg.version) {
        return pkg.version;
      }
    } catch {
      // try the next location
    }
  }
  return 'unknown';
}

const USAGE = `midscene-local — on-device Android agent

Usage:
  midscene-local doctor [--backend shizuku-userservice|adb-shell] [--serial <id>]
  midscene-local run <config.yaml|config.json>
  midscene-local --version
  midscene-local --help

Commands:
  doctor   Probe the device: capabilities, health, displays and timing.
  run      Execute the tasks described by a config file.

Backends:
  shizuku-userservice  (default) On-device path. The host app injects
                       MIDSCENE_EXEC_BRIDGE_URL/TOKEN; commands reach a Shizuku
                       user service running as shell (uid 2000).
  adb-shell            Drive the device from this host over adb.
`;

function parseArgs(argv: string[]) {
  const flags: Record<string, string> = {};
  const positional: string[] = [];

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index] as string;
    if (arg.startsWith('--')) {
      const [key, inlineValue] = arg.slice(2).split('=');
      const next = argv[index + 1];
      if (inlineValue !== undefined) {
        flags[key as string] = inlineValue;
      } else if (next !== undefined && !next.startsWith('--')) {
        flags[key as string] = next;
        index += 1;
      } else {
        flags[key as string] = 'true';
      }
    } else {
      positional.push(arg);
    }
  }

  return { flags, positional };
}

/**
 * Build the transport the CLI drives directly.
 *
 * `run <config>` goes through the runner, which selects its own transport, so
 * this only serves `doctor`. With no `--backend` the CLI behaves like the
 * bundled agent: it needs the host app's bridge coordinates in the environment.
 */
function createTransportFromFlags(
  flags: Record<string, string>,
): AndroidTransport {
  const backend = flags.backend ?? 'shizuku-userservice';

  if (backend === 'adb-shell') {
    return new AdbShellTransport({
      adbPath: flags.adbPath,
      serial: flags.serial,
    });
  }

  if (backend !== 'shizuku-userservice') {
    throw new Error(
      `Unknown backend "${backend}"; expected shizuku-userservice or adb-shell`,
    );
  }

  const bridge = bridgeFromEnv();
  if (!bridge) {
    throw new Error(
      'The shizuku-userservice backend needs the host app: it must set ' +
        'MIDSCENE_EXEC_BRIDGE_URL and MIDSCENE_EXEC_BRIDGE_TOKEN. From a PC, ' +
        'pass --backend adb-shell --serial <id> instead.',
    );
  }

  const runner = new ExecBridgeCommandRunner(bridge);
  return new ShellTransport({
    runner,
    fileIo: createBridgeFileIo(runner),
    fileChannelDir: requireFileChannelDir(
      flags['file-channel-dir'] ?? process.env.MIDSCENE_FILE_CHANNEL_DIR,
    ),
  });
}

/**
 * The file channel has no safe default: the directory must be writable by the
 * shell uid and readable by this process. A missing value used to fall back to
 * an on-device path, which fails later with an opaque EACCES.
 */
function requireFileChannelDir(value: string | undefined): string {
  if (!value) {
    throw new Error(
      'The file channel directory is required on the on-device path: pass ' +
        '--file-channel-dir <path> or set MIDSCENE_FILE_CHANNEL_DIR. It must ' +
        'be writable by the shell uid and readable by this process (the app ' +
        'uses its external files directory).',
    );
  }

  return value;
}

async function doctor(flags: Record<string, string>): Promise<number> {
  const transport = createTransportFromFlags(flags);

  try {
    const health = await transport.healthCheck();
    const capabilities = await transport.getCapabilities();
    const displays = await transport.listDisplays();

    const screenshotStartedAt = Date.now();
    const screenshot = await transport.screenshot();
    const screenshotMs = Date.now() - screenshotStartedAt;

    console.log(
      JSON.stringify(
        {
          ok: health.ok,
          backend: transport.backend,
          uid: capabilities.uid,
          privileged: capabilities.privileged,
          capabilities,
          displays: displays.map((display) => ({
            id: display.id,
            name: display.name,
            size: `${display.width}x${display.height}`,
            isDefault: display.isDefault,
            isVirtual: display.isVirtual,
          })),
          screenshot: { bytes: screenshot.length, ms: screenshotMs },
        },
        null,
        2,
      ),
    );

    await transport.close();
    return health.ok ? 0 : 1;
  } catch (error) {
    console.error(
      `doctor failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    return 1;
  }
}

async function run(configPath: string | undefined): Promise<number> {
  if (!configPath) {
    console.error('run requires a config file path\n');
    console.error(USAGE);
    return 2;
  }

  // Validate before touching a device so a typo fails fast.
  loadLocalAgentConfig(configPath);

  const result = await runLocalAgentConfigFile(configPath, {
    onEvent: (event) => {
      if (event.type !== 'task') {
        console.error(`[${event.type}] ${event.message}`);
      } else {
        console.error(`[task] ${event.message}`);
      }
    },
  });

  console.log(JSON.stringify(result, null, 2));
  return result.ok ? 0 : 1;
}

async function main(): Promise<void> {
  const { flags, positional } = parseArgs(process.argv.slice(2));
  const command = positional[0];

  if (flags.version === 'true' || command === '--version') {
    console.log(`midscene-local v${readVersion()} (node ${process.version})`);
    return;
  }

  if (!command || flags.help === 'true') {
    console.log(USAGE);
    process.exitCode = command ? 0 : 2;
    return;
  }

  switch (command) {
    case 'doctor':
      process.exitCode = await doctor(flags);
      return;
    case 'run':
      process.exitCode = await run(positional[1]);
      return;
    default:
      console.error(`Unknown command "${command}"\n`);
      console.error(USAGE);
      process.exitCode = 2;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : String(error));
  process.exitCode = 1;
});
