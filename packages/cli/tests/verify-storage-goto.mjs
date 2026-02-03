import { createServer } from 'node:http';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
// Quick test to verify localStorage and sessionStorage persist across page.goto()
import puppeteer from 'puppeteer';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Start HTTP server
const server = createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/html' });
  res.end(`
    <!DOCTYPE html>
    <html>
    <head><title>Test</title></head>
    <body>
      <h1>Storage Test</h1>
      <div id="info"></div>
      <script>
        document.getElementById('info').textContent =
          'localStorage: ' + localStorage.getItem('test') +
          ', sessionStorage: ' + sessionStorage.getItem('session');
      </script>
    </body>
    </html>
  `);
});

server.listen(0, '127.0.0.1', async () => {
  const address = server.address();
  const url = `http://${address.address}:${address.port}/`;
  console.log(`Testing at ${url}\n`);

  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();

  console.log('=== Test 1: First goto() ===');
  await page.goto(url);

  await page.evaluate(() => {
    localStorage.setItem('test', 'value1');
    sessionStorage.setItem('session', 'value2');
  });

  const storage1 = await page.evaluate(() => ({
    local: localStorage.getItem('test'),
    session: sessionStorage.getItem('session'),
  }));
  console.log('After setting:', storage1);

  console.log('\n=== Test 2: Second goto() (same URL, same Page) ===');
  await page.goto(url);

  const storage2 = await page.evaluate(() => ({
    local: localStorage.getItem('test'),
    session: sessionStorage.getItem('session'),
  }));
  console.log('After reload:', storage2);

  console.log('\n=== Result ===');
  const localPreserved = storage2.local === 'value1';
  const sessionPreserved = storage2.session === 'value2';

  console.log(`localStorage preserved: ${localPreserved ? '✅' : '❌'}`);
  console.log(`sessionStorage preserved: ${sessionPreserved ? '✅' : '❌'}`);

  if (localPreserved && sessionPreserved) {
    console.log(
      '\n✅ SUCCESS: Our fix should work! Storage persists across page.goto()',
    );
  } else {
    console.log('\n❌ PROBLEM: Storage was lost, need additional fix');
  }

  await browser.close();
  server.close();
  process.exit(localPreserved && sessionPreserved ? 0 : 1);
});
