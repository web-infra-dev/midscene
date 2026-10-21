import { get } from 'node:http';
import { afterEach, describe, expect, it, rs } from '@rstest/core';
import * as expressActual from 'express' with { rstest: 'importActual' };
import { PlaygroundServer } from '../../src/server';

// Exercise real sockets: mocked listen callbacks cannot detect port collisions.
rs.mock('express', () => expressActual);

describe('PlaygroundServer listening', () => {
  const servers: PlaygroundServer[] = [];

  function createServer() {
    const server = new PlaygroundServer();
    servers.push(server);
    return server;
  }

  afterEach(async () => {
    await Promise.all(servers.splice(0).map((server) => server.close()));
  });

  it('allocates distinct ports for concurrent servers and exposes the bound port', async () => {
    const first = createServer();
    const second = createServer();

    await Promise.all([first.launch(0), second.launch(0)]);

    expect(first.port).toBeGreaterThan(0);
    expect(second.port).toBeGreaterThan(0);
    expect(first.port).not.toBe(second.port);
    expect(first.server?.address()).toMatchObject({ port: first.port });
    expect(second.server?.address()).toMatchObject({ port: second.port });

    const status = await new Promise<number | undefined>((resolve, reject) => {
      get(`http://127.0.0.1:${first.port}/status`, (response) => {
        response.resume();
        response.on('end', () => resolve(response.statusCode));
      }).on('error', reject);
    });
    expect(status).toBe(200);
  });

  it('rejects an occupied port and can launch again after the failure', async () => {
    const first = createServer();
    const second = createServer();
    await first.launch(0);

    await expect(second.launch(first.port!)).rejects.toMatchObject({
      code: 'EADDRINUSE',
    });
    expect(second.server).toBeUndefined();

    await second.launch(0);
    expect(second.port).not.toBe(first.port);
  });
});
