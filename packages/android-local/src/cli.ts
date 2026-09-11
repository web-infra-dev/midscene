#!/usr/bin/env node
/**
 * `midscene-local` — the deployment shell around the on-device agent.
 *
 * Today it runs inside Termux/Node on the phone; the same commands are what an
 * Android host app (embedded Node + thin UI) will call later, so the surface is
 * deliberately small: inspect the device (`doctor`) and run a config (`run`).
 */
import process from 'node:process';

import { loadLocalAgentConfig } from './config/schema';
import { runLocalAgentConfigFile } from './runner/run';
import { AdbShellTransport } from './transport/adb-shell';
import { RishTransport } from './transport/rish';
import type { AndroidTransport } from './transport/types';

const USAGE = `midscene-local — on-device Android agent

Usage:
  midscene-local doctor [--backend rish|adb-shell] [--serial <id>]
  midscene-local run <config.yaml|config.json>
  midscene-local --help

Commands:
  doctor   Probe the device: capabilities, health, displays and timing.
  run      Execute the tasks described by a config file.
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

function createTransportFromFlags(
  flags: Record<string, string>,
): AndroidTransport {
  const backend = flags.backend ?? 'rish';

  if (backend === 'adb-shell') {
    return new AdbShellTransport({
      adbPath: flags.adbPath,
      serial: flags.serial,
    });
  }

  if (backend !== 'rish') {
    throw new Error(`Unknown backend "${backend}"; expected rish or adb-shell`);
  }

  return new RishTransport({ rishPath: flags.rishPath });
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
