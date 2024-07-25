# Quick Start

Currently we use OpenAI GPT-4o as the default engine. So prepare an OpenAI key that is eligible for accessing GPT-4o.

```bash
# replace by your own
export OPENAI_API_KEY="sk-abcdefghijklmnopqrstuvwxyz"

# optional, if you use a proxy
# export OPENAI_BASE_URL="..."
```

Install 

```bash
npm install midscene --save-dev
# for demo use
npm install puppeteer ts-node --save-dev 
```

Write a simple demo to **extract the main download button of vscode website**.
Save the following code as `./demo.ts`.

```typescript
import puppeteer from 'puppeteer';
import Insight, { query } from 'midscene';

Promise.resolve(
  (async () => {
    // launch vscode website
    const browser = await puppeteer.launch();
    const page = (await browser.pages())[0];
    await page.setViewport({ width: 1920, height: 1080 })
    await page.goto('https://code.visualstudio.com/');
    // wait for 5s
    console.log('Wait for 5 seconds. After that, the demo will begin.');
    await new Promise((resolve) => setTimeout(resolve, 5 * 1000));

    // ⭐ find the main download button and its backgroundColor ⭐
    const insight = await Insight.fromPuppeteerBrowser(browser);
    const downloadBtn = await insight.locate(
      query('main download button on the page', {
        textsOnButton: 'string',
        backgroundColor: 'string, color of text, one of blue / red / yellow / green / white / black / others',
      }),
    );
    console.log(`backgroundColor of main download button is: `, downloadBtn!.backgroundColor);
    console.log(`text on the button is: `, downloadBtn!.textsOnButton);

    // clean up
    await browser.close();
  })(),
);
```

Using ts-node to run:

```bash
# run
npx ts-node demo.ts

# it should print '... is blue'
```

After running, MidScene will generate a log dump, which is placed in `./midscene_run/latest.insight.json` by default. Then put this file into [Visualization Tool](/visualization/), and you will have a clearer understanding of the process.

