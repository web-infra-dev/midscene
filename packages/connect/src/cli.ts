import { createReportCliCommands } from '@midscene/core';
import { CLIError, reportCLIError, runToolsCLI } from '@midscene/shared/cli';
import {
  loadDefinition,
  parseDeviceOptions,
  parseFlags,
  str,
} from './cli-utils';
import { ConnectError, RemoteDevice, agentOverConnectProtocol } from './client';
import { DEFAULT_CONNECT_PORT } from './device';
import { serveDevice } from './server';
import { ConnectMidsceneTools } from './tools';

declare const __VERSION__: string;
const scriptName = 'midscene-connect';

async function serve(args: string[]) {
  const { positionals, flags } = parseFlags(args);
  const [file] = positionals;
  if (!file || flags.help)
    return console.log(`
Usage: ${scriptName} serve <device.mjs> [--port ${DEFAULT_CONNECT_PORT}] [--host 127.0.0.1] [--token <token>] [device options]

Connects the device defined in <device.mjs> and serves it over HTTP.
Device options are declared by the definition's \`options\` schema.`);
  const { port, host, token, ...deviceFlags } = flags;
  const definition = await loadDefinition(file);
  const portValue = str(port, 'port');
  const served = await serveDevice(definition, {
    port: portValue === undefined ? undefined : Number(portValue),
    host: str(host, 'host'),
    token: str(token, 'token'),
    options: parseDeviceOptions(definition, deviceFlags),
  });
  console.log(`✔ ${definition.name} is ready`);
  console.log(`  Connect URL: ${served.url}`);
  console.log(`  API docs:    ${served.url}/api/docs/`);
  if (served.token) console.log(`  Token:       ${served.token}`);
  const stop = () => {
    served.close().finally(() => process.exit(0));
  };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
}

async function playground(args: string[]) {
  const { flags } = parseFlags(args);
  const url = str(flags.url, 'url');
  const token = str(flags.token, 'token');
  const port = str(flags.port, 'port');
  const device = await RemoteDevice.connect({ url, token });
  const { playgroundForAgentFactory } = await import('@midscene/playground');
  await playgroundForAgentFactory(() =>
    agentOverConnectProtocol({ url, token }),
  ).launch({
    port: port === undefined ? undefined : Number(port),
    openBrowser: flags['no-open'] === undefined,
  });
  console.log(`🎮 Playground for ${device.describe()} (${device.client.url})`);
}

async function main(argv = process.argv.slice(2)) {
  const [command, ...rest] = argv;
  if (command === 'serve') return serve(rest);
  if (command === 'playground') return playground(rest);

  const showingHelp = !command || command === '--help' || command === '-h';
  const { flags } = parseFlags(rest);
  let device: RemoteDevice | undefined;
  try {
    device = await RemoteDevice.connect({
      url: typeof flags.url === 'string' ? flags.url : undefined,
      token: typeof flags.token === 'string' ? flags.token : undefined,
    });
  } catch (error) {
    if (
      !showingHelp &&
      command !== '--version' &&
      command !== '-v' &&
      command !== 'version'
    )
      throw error;
  }
  if (showingHelp) {
    console.log(`
Device commands:
  serve <device.mjs>   Connect a device and serve it over HTTP (run this first)
  playground           Open the Playground for the served device
${device ? `\nServed device: ${device.describe()} (${device.client.url})` : '\nNo served device reachable; device actions are listed once one is running.'}`);
  }
  await runToolsCLI(new ConnectMidsceneTools(device), scriptName, {
    argv,
    stripPrefix: 'connect_',
    version: __VERSION__,
    extraCommands: createReportCliCommands(),
  });
}

main().catch((error) => {
  process.exit(
    reportCLIError(
      error instanceof ConnectError ? new CLIError(error.message) : error,
    ),
  );
});
