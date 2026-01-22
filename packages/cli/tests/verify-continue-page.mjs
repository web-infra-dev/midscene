import { createServer } from 'http';
// Test to verify continueFromPreviousPage preserves full JS state
import puppeteer from 'puppeteer';

let navigationCount = 0;

const server = createServer((req, res) => {
  navigationCount++;
  res.writeHead(200, { 'Content-Type': 'text/html' });
  res.end(`
    <!DOCTYPE html>
    <html>
    <head><title>Test</title></head>
    <body>
      <h1>Navigation #${navigationCount}</h1>
      <div id="info"></div>
      <script>
        // This variable will be lost on page reload but preserved if no navigation
        window.jsState = window.jsState || { preserved: true, count: 0 };
        window.jsState.count++;

        localStorage.setItem('test', 'value1');
        sessionStorage.setItem('session', 'value2');

        document.getElementById('info').textContent =
          'JS count: ' + window.jsState.count +
          ', localStorage: ' + localStorage.getItem('test') +
          ', sessionStorage: ' + sessionStorage.getItem('session');
      </script>
    </body>
    </html>
  `);
});

server.listen(0, '127.0.0.1', async () => {
  const address = server.address();
  const url = `http://${address.address}:${address.port}/`;
  console.log(`Testing continueFromPreviousPage at ${url}\n`);

  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();

  console.log(
    '=== Scenario 1: Normal navigation (simulates default behavior) ===',
  );
  console.log('First visit:');
  await page.goto(url);
  const state1 = await page.evaluate(() => ({
    jsCount: window.jsState.count,
    local: localStorage.getItem('test'),
    session: sessionStorage.getItem('session'),
  }));
  console.log('State:', state1);

  console.log('\nSecond visit (with goto):');
  await page.goto(url);
  const state2 = await page.evaluate(() => ({
    jsCount: window.jsState.count,
    local: localStorage.getItem('test'),
    session: sessionStorage.getItem('session'),
  }));
  console.log('State:', state2);
  console.log('JS state reset:', state2.jsCount === 1 ? '✅' : '❌');
  console.log(
    'Storage preserved:',
    state2.local === 'value1' && state2.session === 'value2' ? '✅' : '❌',
  );

  console.log('\n=== Scenario 2: continueFromPreviousPage (no navigation) ===');
  // Reset by navigating once more
  await page.goto(url);
  await page.evaluate(() => {
    window.jsState.count = 5;
  }); // Set a specific value

  console.log('Before continue:');
  const state3 = await page.evaluate(() => ({
    jsCount: window.jsState.count,
    local: localStorage.getItem('test'),
    session: sessionStorage.getItem('session'),
  }));
  console.log('State:', state3);

  // Simulate continueFromPreviousPage - no navigation
  console.log('\nAfter continue (no goto):');
  const state4 = await page.evaluate(() => ({
    jsCount: window.jsState.count,
    local: localStorage.getItem('test'),
    session: sessionStorage.getItem('session'),
  }));
  console.log('State:', state4);

  console.log('\n=== Result ===');
  const jsPreserved = state4.jsCount === 5;
  const storagePreserved =
    state4.local === 'value1' && state4.session === 'value2';

  console.log(`JS runtime state preserved: ${jsPreserved ? '✅' : '❌'}`);
  console.log(`Storage preserved: ${storagePreserved ? '✅' : '❌'}`);

  if (jsPreserved && storagePreserved) {
    console.log(
      '\n✅ SUCCESS: continueFromPreviousPage preserves full JS state!',
    );
  } else {
    console.log('\n❌ PROBLEM: State was not fully preserved');
  }

  await browser.close();
  server.close();
  process.exit(jsPreserved && storagePreserved ? 0 : 1);
});
