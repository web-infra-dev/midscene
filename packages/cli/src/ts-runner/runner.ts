import { resolve } from 'node:path';
import { config } from 'dotenv';
import { AgentProxy } from './agent-proxy';
import type { CdpConfig, LaunchConfig } from './types';

interface UserScriptExports {
  launch?: LaunchConfig;
  cdp?: CdpConfig;
  run?: (agent: AgentProxy) => Promise<void>;
}

config();

const agentInstance = new AgentProxy();
(globalThis as any).agent = agentInstance;

async function cleanup(): Promise<void> {
  await agentInstance.destroy().catch(() => {});
}

process.on('beforeExit', async () => {
  await cleanup();
});

process.on('uncaughtException', async (error) => {
  console.error('Uncaught Exception:', error);
  await cleanup();
  process.exit(1);
});

process.on('unhandledRejection', async (reason) => {
  console.error('Unhandled Rejection:', reason);
  await cleanup();
  process.exit(1);
});

export async function run(scriptPath?: string): Promise<void> {
  const path = scriptPath ?? process.argv[2];
  if (!path) {
    console.error('Usage: midscene <script.ts>');
    process.exit(1);
    return;
  }

  const absolutePath = resolve(process.cwd(), path);
  const userModule = (await import(absolutePath)) as UserScriptExports;

  // Handle declarative config exports
  if (userModule.launch) {
    await agentInstance.launch(userModule.launch);
  } else if (userModule.cdp) {
    await agentInstance.connect(userModule.cdp);
  }

  // Call run function if exported
  if (typeof userModule.run === 'function') {
    await userModule.run(agentInstance);
  }
}

// Auto-run when executed directly
if (require.main === module) {
  run().catch(async (error) => {
    console.error(error);
    await cleanup();
    process.exit(1);
  });
}

export { cleanup };
