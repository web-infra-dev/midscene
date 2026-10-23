import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer } from 'node:http';
import puppeteer from 'puppeteer';
import { openIsolatedPage } from '../src/browser-session.mjs';

const server = createServer((_request, response) => {
  response.writeHead(200, { 'content-type': 'text/html' });
  response.end('<!doctype html><title>Storage isolation fixture</title>');
});
server.listen(0, '127.0.0.1');
await once(server, 'listening');
let browser;
try {
  const origin = `http://127.0.0.1:${server.address().port}`;
  const policy = { allowedOrigins: [origin] };
  browser = await puppeteer.launch({ headless: true });
  const first = await openIsolatedPage(browser, policy);
  await first.page.goto(origin);
  await first.page.evaluate(() => {
    localStorage.setItem('saved-note', 'first criterion');
    document.cookie = 'fixture=first';
  });
  await first.page.reload();
  assert.equal(
    await first.page.evaluate(() => localStorage.getItem('saved-note')),
    'first criterion',
  );
  const second = await openIsolatedPage(browser, policy);
  await second.page.goto(origin);
  assert.equal(
    await second.page.evaluate(() => localStorage.getItem('saved-note')),
    null,
  );
  assert.equal(await second.page.evaluate(() => document.cookie), '');
  await second.close();
  assert.equal(
    await first.page.evaluate(() => localStorage.getItem('saved-note')),
    'first criterion',
  );
  await first.close();
  console.log(
    'Browser storage survives reload within a criterion and is isolated between criteria.',
  );
} finally {
  await browser?.close();
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
}
