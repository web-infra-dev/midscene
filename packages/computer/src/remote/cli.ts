import { parseArgs } from 'node:util';
import { startComputerBridge } from './server';

async function main() {
  const { values } = parseArgs({
    options: {
      host: { type: 'string' },
      port: { type: 'string' },
      'token-env': {
        type: 'string',
        default: 'MIDSCENE_COMPUTER_BRIDGE_TOKEN',
      },
      'target-id': { type: 'string' },
      help: { type: 'boolean', short: 'h' },
    },
  });
  if (values.help) {
    console.log(
      'midscene-computer-bridge [--host 127.0.0.1] [--port 8766] [--token-env MIDSCENE_COMPUTER_BRIDGE_TOKEN] [--target-id ID]\nRun in the target desktop login session. The token is read from the named environment variable.',
    );
    return;
  }
  const token = process.env[values['token-env']!];
  if (!token)
    throw new Error(
      'Set the bridge authentication environment variable before starting the service.',
    );
  const bridge = await startComputerBridge({
    token,
    host: values.host,
    port: values.port === undefined ? undefined : Number(values.port),
    targetId: values['target-id'],
  });
  console.log(`Computer bridge listening: ${bridge.url}`);
  const shutdown = () => {
    void bridge.close().catch(() => {
      console.error('Computer bridge cleanup failed.');
      process.exitCode = 1;
    });
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}

void main().catch((error) => {
  console.error(
    error instanceof Error ? error.message : 'Computer bridge failed.',
  );
  process.exitCode = 1;
});
