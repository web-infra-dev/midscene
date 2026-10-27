import assert from 'node:assert/strict';
import test from 'node:test';
import { allowedBrowserRequestUrl } from '../src/browser-session.mjs';

const policy = { allowedOrigins: ['https://preview.example.com'] };

test('only operator-approved network and blob origins are accepted', () => {
  assert.equal(allowedBrowserRequestUrl('https://preview.example.com/app', policy).origin, 'https://preview.example.com');
  assert.equal(allowedBrowserRequestUrl('blob:https://preview.example.com/123', policy).origin, 'https://preview.example.com');
  assert.equal(allowedBrowserRequestUrl('data:image/png;base64,AAAA', policy).protocol, 'data:');
  for (const value of [
    'blob:https://evil.example/123',
    'blob:http://localhost:1234/123',
    'blob:null/123',
    'https://evil.example/',
    'file:///etc/passwd',
    'javascript:alert(1)',
    'https://user:password@preview.example.com/',
  ]) {
    assert.throws(() => allowedBrowserRequestUrl(value, policy), undefined, value);
  }
});

test('blocked requests are aborted; legitimate requests are continued', async () => {
  const { configurePage } = await import('../src/browser-session.mjs');
  const callbacks = new Map();
  const page = {
    async setViewport() {},
    async setBypassServiceWorker() {},
    async setRequestInterception() {},
    on(event, callback) { callbacks.set(event, callback); },
  };
  await configurePage(page, policy);
  const outcomes = [];
  const fakeRequest = (url) => ({
    url: () => url,
    continue: async () => outcomes.push('continue'),
    abort: async () => outcomes.push('abort'),
  });
  callbacks.get('request')(fakeRequest('blob:https://evil.example/id'));
  callbacks.get('request')(fakeRequest('blob:https://preview.example.com/id'));
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(outcomes, ['abort', 'continue']);
});
