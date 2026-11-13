import { networkInterfaces } from 'node:os';
import path from 'node:path';
import { spinner } from '@clack/prompts';
import { serve } from '@hono/node-server';
import { createViewer, loadTestcases } from '@midscene/benchmark-grounding';
import { getDebug } from '@midscene/shared/logger';
import { Command } from 'commander';
import { Hono } from 'hono';
import open from 'open';
import c from 'tinyrainbow';
import { z } from 'zod';
import { formatDuration, printHeader, printResult, write } from './output';

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
      printHeader('VIEWER');
      const status = spinner({
        accessible: !process.stdout.isTTY,
        withGuide: false,
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
        status.clear();
        printResult(
          'PASS',
          `Viewer ready ${c.dim(`(${formatDuration(performance.now())})`)}`,
        );
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
        write(
          '',
          ` Local:    ${c.cyan(url)}`,
          ...network.map((line) => ` ${c.cyan(line)}`),
          '',
          ` Dataset:  ${options.testcases ? path.resolve(options.testcases) : 'Bundled testcases'}`,
          ` Testcases: ${testcases.length} · ${testcases.filter(({ testcase }) => testcase.platform === 'web').length} Web · ${testcases.filter(({ testcase }) => testcase.platform === 'mobile').length} Mobile`,
          ' Mode:     Read-only',
          '',
          c.dim(
            ' Press Ctrl+C to stop · Refresh the browser to reload testcases',
          ),
          '',
        );
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
        status.clear();
        throw error;
      }
    });
}
