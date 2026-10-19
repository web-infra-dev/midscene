import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';
import { verifyWebhook } from './github.mjs';

export function createVerifyServer({ store, webhookSecret, onQueued }) {
  return createServer(async (req, res) => {
    res.setHeader('x-content-type-options', 'nosniff');
    res.setHeader('cache-control', 'no-store');
    res.setHeader('referrer-policy', 'no-referrer');
    res.setHeader(
      'content-security-policy',
      "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; frame-ancestors 'none'",
    );
    try {
      if (req.method === 'GET' && req.url === '/health') {
        res
          .writeHead(200, { 'content-type': 'application/json' })
          .end('{"status":"ok"}');
        return;
      }
      if (req.method === 'POST' && req.url === '/webhooks/github') {
        const chunks = [];
        let size = 0;
        for await (const chunk of req) {
          size += chunk.length;
          if (size > 1024 * 1024) {
            res.writeHead(413).end();
            return;
          }
          chunks.push(chunk);
        }
        const body = Buffer.concat(chunks);
        if (
          !verifyWebhook(
            body,
            req.headers['x-hub-signature-256'],
            webhookSecret,
          )
        ) {
          res.writeHead(401).end();
          return;
        }
        const deliveryId = req.headers['x-github-delivery'];
        const event = req.headers['x-github-event'];
        if (!/^[\w-]{1,100}$/.test(deliveryId ?? '')) {
          res.writeHead(400).end();
          return;
        }
        if (
          !['pull_request', 'deployment_status', 'check_run', 'ping'].includes(
            event,
          )
        ) {
          res.writeHead(202).end();
          return;
        }
        let payload;
        try {
          payload = JSON.parse(body);
        } catch {
          res.writeHead(400).end();
          return;
        }
        if (!(await store.get('deliveries', deliveryId))) {
          await store.put('deliveries', deliveryId, {
            id: deliveryId,
            event,
            payload,
            state: 'pending',
            attempts: 0,
          });
        }
        res.writeHead(202).end();
        onQueued();
        return;
      }
      const match = /^\/verifications\/([a-f0-9]{64})\/([\w.-]+)$/.exec(
        req.url ?? '',
      );
      if (req.method === 'GET' && match) {
        const [, id, name] = match;
        const run = await store.get('runs', id);
        if (!run?.report) {
          res.writeHead(404).end();
          return;
        }
        const directory = path.join(store.root, 'evidence', id);
        const manifest = JSON.parse(
          await readFile(path.join(directory, 'manifest.json'), 'utf8'),
        );
        if (
          name !== 'manifest.json' &&
          !manifest.files.some((file) => file.path === name)
        ) {
          res.writeHead(404).end();
          return;
        }
        const mime = name.endsWith('.png')
          ? 'image/png'
          : name.endsWith('.html')
            ? 'text/html; charset=utf-8'
            : name.endsWith('.json')
              ? 'application/json'
              : 'text/plain; charset=utf-8';
        res
          .writeHead(200, { 'content-type': mime })
          .end(await readFile(path.join(directory, name)));
        return;
      }
      res.writeHead(404).end();
    } catch {
      if (!res.headersSent) res.writeHead(500);
      res.end();
    }
  });
}

// Single worker; deliveries are acknowledged only after persistence. Restarts
// resume pending work. Three infrastructure failures leave a visible dead letter.
export function createQueue({ store, controller, onError = () => {} }) {
  let running;
  async function drain() {
    for (;;) {
      const pending = (await store.list('deliveries')).filter(
        (item) => item.state === 'pending',
      );
      if (!pending.length) return;
      for (const item of pending) {
        try {
          await controller.handle(item.event, item.payload, item.id);
          item.state = 'completed';
        } catch {
          item.attempts += 1;
          if (item.attempts >= 3) item.state = 'failed';
          onError(item.id, item.state);
        }
        await store.put('deliveries', item.id, item);
      }
      // Retry on the next timer tick, not in a tight rate-limit loop.
      if (pending.some((item) => item.state === 'pending')) return;
    }
  }
  return {
    wake() {
      if (!running)
        running = drain()
          .catch(() => onError('queue', 'failed'))
          .finally(() => {
            running = undefined;
          });
      return running;
    },
  };
}
