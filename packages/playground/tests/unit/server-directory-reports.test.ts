import * as fsActual from 'node:fs' with { rstest: 'importActual' };
import * as fs from 'node:fs';
import { mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { get } from 'node:http';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import * as agentActual from '@midscene/core/agent' with {
  rstest: 'importActual',
};
import { setMidsceneRunDir } from '@midscene/shared/common';
import { afterEach, beforeEach, describe, expect, it, rs } from '@rstest/core';
import * as expressActual from 'express' with { rstest: 'importActual' };
import { PlaygroundServer } from '../../src/server';
import type { PlaygroundReportRef } from '../../src/types';

rs.mock('express', () => expressActual);
const png =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGNgYAAAAAMAASsJTYQAAAAASUVORK5CYII=';
let root: string;
let server: PlaygroundServer;
let agent: InstanceType<typeof agentActual.Agent>;

beforeEach(async () => {
  for (const method of [
    'existsSync',
    'mkdirSync',
    'readFileSync',
    'createReadStream',
  ] as const)
    rs.mocked(fs[method]).mockImplementation(fsActual[method] as any);
  root = await mkdtemp(join(tmpdir(), 'playground-directory-report-'));
  setMidsceneRunDir(root);
});
afterEach(async () => {
  await server?.close();
  await agent?.destroy();
  setMidsceneRunDir(undefined);
  await rm(root, { recursive: true, force: true });
});

function request(
  path: string,
): Promise<{ status: number; type: string; body: Buffer }> {
  return new Promise((resolve, reject) => {
    get(`http://127.0.0.1:${server.port}${path}`, (response) => {
      const chunks: Buffer[] = [];
      response.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
      response.on('error', reject);
      response.on('end', () =>
        resolve({
          status: response.statusCode!,
          type: response.headers['content-type'] ?? '',
          body: Buffer.concat(chunks),
        }),
      );
    }).on('error', reject);
  });
}

async function generate(format?: 'html-and-external-assets') {
  agent = new agentActual.Agent(
    {
      interfaceType: 'puppeteer',
      actionSpace: () => [],
      destroy: async () => {},
    } as any,
    {
      modelConfig: {
        MIDSCENE_MODEL_NAME: 'test-model',
        MIDSCENE_MODEL_API_KEY: 'test-key',
      },
      autoPrintReportMsg: false,
      ...(format ? { outputFormat: format } : {}),
    },
  );
  await agent.recordToReport('first', { screenshotBase64: png });
  await agent.recordToReport('second', { screenshotBase64: png });
  const path = (await agent.finalizeReport())!;
  server = new PlaygroundServer(agent, root);
  await server.launch(0);
  const report = (await (
    server as unknown as {
      registerReportFile(path: string): Promise<PlaygroundReportRef>;
    }
  ).registerReportFile(path))!;
  return { path, report };
}

describe('real Agent reports through Playground HTTP routes', () => {
  it('serves generated directory metadata, every execution and replay without losing earlier actions', async () => {
    const { report } = await generate('html-and-external-assets');
    expect(report.format).toBe('html-and-external-assets');
    expect((await request(report.url)).status).toBe(200);
    const metadata = await request(`${report.url}report.json`);
    expect(metadata.status).toBe(200);
    expect(metadata.type).toContain('application/json');
    const manifest = JSON.parse(metadata.body.toString());
    expect(manifest.groups[0].dumps).toHaveLength(2);
    for (const path of manifest.groups[0].dumps) {
      const data = await request(`${report.url}${path}`);
      expect(data.status).toBe(200);
      expect(data.type).toContain('application/json');
      expect(JSON.parse(data.body.toString()).executions).toHaveLength(1);
    }
    const replay = await request(report.replayUrl!);
    expect(replay.status).toBe(200);
    const dump = JSON.parse(replay.body.toString());
    expect(
      dump.executions.map((execution: { name: string }) => execution.name),
    ).toEqual(['Log - first', 'Log - second']);
    const refs = dump.executions.map(
      (execution: any) => execution.tasks[0].recorder[0].screenshot,
    );
    expect(refs[0].id).not.toBe(refs[1].id);
    expect(refs[0].path).toBe(refs[1].path);
    const image = await request(
      `${report.url}${refs[0].path.replace(/^\.\//, '')}`,
    );
    expect(image.body).toEqual(Buffer.from(png.split(',')[1], 'base64'));
  });

  it('keeps the default report self-contained and serves its complete replay', async () => {
    const { path, report } = await generate();
    expect(report.format).toBe('single-html');
    const html = await readFile(path, 'utf8');
    expect(html).toContain(png);
    const replay = await request(report.replayUrl!);
    expect(JSON.parse(replay.body.toString()).executions).toHaveLength(2);
    expect((await request(`${report.url}report.json`)).status).toBe(404);
  });

  it('returns JSON errors for unlisted/missing data, traversal and expired reports', async () => {
    const { path, report } = await generate('html-and-external-assets');
    await writeFile(
      join(dirname(path), 'data/unlisted.json'),
      '{"secret":"not part of the report"}',
    );
    expect((await request(`${report.url}data/unlisted.json`)).status).toBe(404);
    const missing = await request(`${report.url}data/missing.json`);
    expect(missing.status).toBe(404);
    expect(missing.type).toContain('application/json');
    expect(
      (await request(`${report.url}data/%2e%2e%5cprivate.json`)).status,
    ).toBe(400);
    const manifestPath = join(dirname(path), 'report.json');
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
    await rm(join(dirname(path), manifest.groups[0].dumps[0]));
    expect(
      (await request(`${report.url}${manifest.groups[0].dumps[0]}`)).status,
    ).toBe(404);
    const outside = join(root, 'outside-report.json');
    await writeFile(outside, '{"private":true}');
    await symlink(outside, join(dirname(path), manifest.groups[0].dumps[0]));
    expect(
      (await request(`${report.url}${manifest.groups[0].dumps[0]}`)).status,
    ).toBe(400);
    expect((await request('/reports/expired/report.json')).status).toBe(404);
  });
});
