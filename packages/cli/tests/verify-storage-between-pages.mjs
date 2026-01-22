import { createServer } from 'http';
// Test to verify storage sharing between different Page instances
import puppeteer from 'puppeteer';

const server = createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/html' });
  res.end(`
    <!DOCTYPE html>
    <html>
    <head><title>Storage Test</title></head>
    <body>
      <h1>Storage Test</h1>
      <script>
        // Set storage on page load
        if (!localStorage.getItem('test')) {
          localStorage.setItem('test', 'local-value');
        }
        if (!sessionStorage.getItem('test')) {
          sessionStorage.setItem('test', 'session-value');
        }

        document.body.innerHTML += '<p>localStorage: ' + localStorage.getItem('test') + '</p>';
        document.body.innerHTML += '<p>sessionStorage: ' + sessionStorage.getItem('test') + '</p>';
      </script>
    </body>
    </html>
  `);
});

server.listen(0, '127.0.0.1', async () => {
  const address = server.address();
  const url = `http://${address.address}:${address.port}/`;
  console.log(`Testing storage sharing at ${url}\n`);

  const browser = await puppeteer.launch({ headless: true });

  // Test 1: Different Page instances in same Browser
  console.log('=== Test 1: Different Page instances (browser.newPage()) ===');

  const page1 = await browser.newPage();
  await page1.goto(url);
  await page1.evaluate(() => {
    localStorage.setItem('page1-local', 'value1');
    sessionStorage.setItem('page1-session', 'value1');
    document.cookie = 'page1-cookie=value1';
  });

  const storage1 = await page1.evaluate(() => ({
    local: localStorage.getItem('page1-local'),
    session: sessionStorage.getItem('page1-session'),
    cookie: document.cookie.includes('page1-cookie=value1'),
  }));
  console.log('Page 1 set:', storage1);

  // Create a second Page instance
  const page2 = await browser.newPage();
  await page2.goto(url);

  const storage2 = await page2.evaluate(() => ({
    local: localStorage.getItem('page1-local'),
    session: sessionStorage.getItem('page1-session'),
    cookie: document.cookie.includes('page1-cookie=value1'),
  }));
  console.log('Page 2 read:', storage2);

  console.log('\nResults:');
  console.log(`Cookie shared between pages: ${storage2.cookie ? '✅' : '❌'}`);
  console.log(
    `localStorage shared between pages: ${storage2.local ? '✅' : '❌'}`,
  );
  console.log(
    `sessionStorage shared between pages: ${storage2.session ? '✅' : '❌'}`,
  );

  // Test 2: Same Page instance with goto
  console.log('\n=== Test 2: Same Page instance (page.goto()) ===');

  const page3 = await browser.newPage();
  await page3.goto(url);
  await page3.evaluate(() => {
    localStorage.setItem('page3-local', 'value3');
    sessionStorage.setItem('page3-session', 'value3');
    document.cookie = 'page3-cookie=value3';
  });

  const storage3Before = await page3.evaluate(() => ({
    local: localStorage.getItem('page3-local'),
    session: sessionStorage.getItem('page3-session'),
    cookie: document.cookie.includes('page3-cookie=value3'),
  }));
  console.log('Before goto:', storage3Before);

  // Navigate to same URL again
  await page3.goto(url);

  const storage3After = await page3.evaluate(() => ({
    local: localStorage.getItem('page3-local'),
    session: sessionStorage.getItem('page3-session'),
    cookie: document.cookie.includes('page3-cookie=value3'),
  }));
  console.log('After goto:', storage3After);

  console.log('\nResults:');
  console.log(
    `Cookie preserved after goto: ${storage3After.cookie ? '✅' : '❌'}`,
  );
  console.log(
    `localStorage preserved after goto: ${storage3After.local ? '✅' : '❌'}`,
  );
  console.log(
    `sessionStorage preserved after goto: ${storage3After.session ? '✅' : '❌'}`,
  );

  await browser.close();
  server.close();

  // Final summary
  console.log('\n=== Summary ===');
  console.log('Between different Page instances:');
  console.log(
    `  - Cookies: ${storage2.cookie ? '✅ Shared' : '❌ Not shared'}`,
  );
  console.log(
    `  - localStorage: ${storage2.local ? '✅ Shared' : '❌ Not shared'}`,
  );
  console.log(
    `  - sessionStorage: ${storage2.session ? '✅ Shared' : '❌ Not shared'}`,
  );
  console.log('\nWithin same Page instance (after goto):');
  console.log(
    `  - Cookies: ${storage3After.cookie ? '✅ Preserved' : '❌ Not preserved'}`,
  );
  console.log(
    `  - localStorage: ${storage3After.local ? '✅ Preserved' : '❌ Not preserved'}`,
  );
  console.log(
    `  - sessionStorage: ${storage3After.session ? '✅ Preserved' : '❌ Not preserved'}`,
  );

  process.exit(0);
});
