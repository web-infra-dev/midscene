import { resolve } from 'node:path';
import { config } from 'dotenv';
import { AgentProxy } from './agent-proxy.js';
import type { CdpConfig, LaunchConfig } from './types.js';

interface UserScriptExports {
  launch?: LaunchConfig;
  cdp?: CdpConfig;
  run?: (agent: AgentProxy) => Promise<void>;
}

config();

const agentInstance = new AgentProxy();
(globalThis as any).agent = agentInstance;

export async function cleanup(): Promise<void> {
  await agentInstance.destroy().catch((error) => {
    console.error('Error during agent cleanup:', error);
  });
}

process.on('beforeExit', cleanup);

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  cleanup().finally(() => process.exit(1));
});

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled Rejection:', reason);
  cleanup().finally(() => process.exit(1));
});

export async function run(scriptPath?: string): Promise<void> {
  const path = scriptPath ?? process.argv[2];
  if (!path) {
    console.error('Usage: midscene <script.ts>');
    process.exit(1);
    return; // Required for test mocking where process.exit doesn't terminate
  }

  const absolutePath = resolve(process.cwd(), path);
  const userModule = (await import(absolutePath)) as UserScriptExports;

  if (userModule.launch && userModule.cdp) {
    console.warn(
      'Warning: Both "launch" and "cdp" exports found. Using "launch" (cdp will be ignored).',
    );
  }

  if (userModule.launch) {
    await agentInstance.launch(userModule.launch);
  } else if (userModule.cdp) {
    await agentInstance.connect(userModule.cdp);
  }

  if (typeof userModule.run === 'function') {
    await userModule.run(agentInstance);
  }
}

// Auto-run when executed as entry point
run().catch((error) => {
  console.error(error);
  process.exit(1);
});
