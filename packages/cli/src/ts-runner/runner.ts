import { resolve } from 'node:path';
import { config } from 'dotenv';
import { AgentProxy } from './agent-proxy';

interface UserScriptExports {
  run?: () => Promise<void>;
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
    throw new Error('Usage: midscene <script.ts>');
  }

  const absolutePath = resolve(process.cwd(), path);
  const userModule = (await import(absolutePath)) as UserScriptExports;

  if (typeof userModule.run === 'function') {
    await userModule.run();
  }
}

// Auto-run when executed as entry point
run().catch((error) => {
  console.error(error.message ?? error);
  process.exit(1);
});
