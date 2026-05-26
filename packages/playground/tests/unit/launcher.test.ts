import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  playgroundForAgent,
  playgroundForAgentFactory,
} from '../../src/launcher';
import { launchPreparedPlaygroundPlatform } from '../../src/platform-launcher';

function createMockAgent() {
  return {
    interface: {},
    destroy: vi.fn(async () => {}),
  } as any;
}

const staticPath = path.resolve(process.cwd(), 'static');

describe('playground launcher', () => {
  it('should launch with a custom static path and fixed id', async () => {
    const agent = createMockAgent();

    const result = await playgroundForAgent(agent).launch({
      port: 5921,
      openBrowser: false,
      verbose: false,
      staticPath,
      id: 'launcher-instance-id',
    });

    expect(result.port).toBe(5921);
    expect(result.server.id).toBe('launcher-instance-id');
    expect(result.server.staticPath).toBe(staticPath);

    await result.close();
    expect(agent.destroy).toHaveBeenCalledTimes(1);
  });

  it('should launch from agent factory and allow server configuration', async () => {
    const agentFactory = vi.fn(async () => createMockAgent());
    let configuredServer: any;
    const configureServer = vi.fn((server: any) => {
      configuredServer = server;
    });

    const result = await playgroundForAgentFactory(agentFactory).launch({
      port: 5922,
      openBrowser: false,
      verbose: false,
      staticPath,
      configureServer,
    });

    expect(agentFactory).toHaveBeenCalledTimes(1);
    expect(configureServer).toHaveBeenCalledTimes(1);
    expect(configureServer).toHaveBeenCalledWith(result.server);
    expect(result.server.staticPath).toBe(staticPath);
    expect(configuredServer).toBe(result.server);

    await result.close();
  });

  it('should manage prepared platform sidecars for direct agent platforms', async () => {
    const sidecar = {
      id: 'mock-sidecar',
      start: vi.fn(async () => {}),
      stop: vi.fn(async () => {}),
    };

    const result = await launchPreparedPlaygroundPlatform(
      {
        platformId: 'mock',
        title: 'Mock',
        agent: createMockAgent(),
        sidecars: [sidecar],
      },
      {
        port: 5923,
        openBrowser: false,
        verbose: false,
        staticPath,
      },
    );

    expect(sidecar.start).toHaveBeenCalledTimes(1);
    await result.close();
    expect(sidecar.stop).toHaveBeenCalledTimes(1);
  });
});
