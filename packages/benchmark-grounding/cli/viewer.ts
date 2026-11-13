import { networkInterfaces } from 'node:os';
import path from 'node:path';
import { intro, note, outro, spinner } from '@clack/prompts';
import { serve } from '@hono/node-server';
import { createViewer, loadTestcases } from '@midscene/benchmark-grounding';
import { getDebug } from '@midscene/shared/logger';
import { Command } from 'commander';
import { Hono } from 'hono';
import open from 'open';
import { z } from 'zod';
import { version } from '../package.json';

const warn = getDebug('benchmark-grounding:cli', { console: true });
const integer = z.coerce.number().int().positive();

export function viewerCommand() {
  return new Command('viewer')
    .description('Open a read-only testcase viewer.')
    .option(
      '--testcases <directory>',
      'Testcase directory (defaults to the bundled dataset).',
    )
    .option('--names <name...>', 'Exact testcase names to load.')
    .option('--host <host>', 'HTTP listening address.', '127.0.0.1')
    .option('--port <port>', 'HTTP listening port.', '4319')
    .option('--no-open', 'Do not open a browser.')
    .action(async (options) => {
      const port = integer.max(65535).parse(options.port);
      intro(`Midscene Grounding Benchmark · v${version}`);
      const status = spinner({
        accessible: !process.stdout.isTTY,
        onCancel: () => process.exit(130),
      });
      status.start('Loading and validating testcases');
      const selection = {
        directory: options.testcases,
        names: options.names,
      };
      try {
        const testcases = await loadTestcases(selection);
        const app = new Hono();
        app.get('/images/:name/:filename', async (context) => {
          context.header('Cache-Control', 'no-store');
          try {
            const [record] = await loadTestcases({
              directory: selection.directory,
              names: [context.req.param('name')],
            });
            const { image } = record.testcase.reference;
            const filename =
              image.format === 'jpeg' ? 'image.jpg' : 'image.png';
            if (context.req.param('filename') !== filename)
              return context.notFound();
            if (context.req.query('sha256') !== image.sha256)
              return context.text(
                'The screenshot has changed. Reload the viewer.',
                409,
              );
            context.header('Content-Type', `image/${image.format}`);
            return context.body(new Uint8Array(record.files[filename]));
          } catch (error) {
            return context.text(
              `Unable to load screenshot: ${error instanceof Error ? error.message : String(error)}`,
              500,
            );
          }
        });
        app.get('*', async (context) => {
          context.header('Cache-Control', 'no-store');
          try {
            return context.html(
              await createViewer({
                testcases: await loadTestcases(selection),
                imageBaseUrl: '/images',
              }),
            );
          } catch (error) {
            return context.text(
              `Unable to load testcases: ${error instanceof Error ? error.message : String(error)}`,
              500,
            );
          }
        });
        status.message('Starting the local viewer');
        const server = serve({
          fetch: app.fetch,
          hostname: options.host,
          port,
        });
        await new Promise<void>((resolve, reject) => {
          server.once('listening', resolve);
          server.once('error', reject);
        });
        const host =
          options.host === '0.0.0.0' || options.host === '::'
            ? '127.0.0.1'
            : options.host;
        const url = `http://${host.includes(':') ? `[${host}]` : host}:${port}/`;
        status.stop(`Viewer ready in ${Math.round(performance.now())} ms`);
        const network =
          options.host === '0.0.0.0' || options.host === '::'
            ? Object.values(networkInterfaces())
                .flatMap((addresses) => addresses ?? [])
                .filter(
                  (address) => address.family === 'IPv4' && !address.internal,
                )
                .map(
                  (address) => `Network:  http://${address.address}:${port}/`,
                )
            : [];
        note(
          [
            `Local:    ${url}`,
            ...network,
            `Dataset:  ${options.testcases ? path.resolve(options.testcases) : 'Bundled testcases'}`,
            `Cases:    ${testcases.length} · ${testcases.filter(({ testcase }) => testcase.platform === 'web').length} Web · ${testcases.filter(({ testcase }) => testcase.platform === 'mobile').length} Mobile`,
            'Mode:     Read-only',
          ].join('\n'),
          'Viewer',
        );
        outro('Press Ctrl+C to stop · Refresh the browser to reload testcases');
        if (options.open) {
          try {
            await open(url);
          } catch {
            warn(
              `Could not open the browser. Open the viewer manually: ${url}`,
            );
          }
        }
      } catch (error) {
        status.error('Unable to start the viewer');
        throw error;
      }
    });
}
